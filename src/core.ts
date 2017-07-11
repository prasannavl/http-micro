import * as http from "http";
import * as https from "https";
import * as utils from "./utils";
import { Context, contextFactory } from "./context";
import { Router } from "./router";
import { attachServerExtensions, MicroServer } from "./server-utils";

export interface ItemsContainer {
    items: Map<string, any>;
    getItem<T = any>(key: string): T;
    setItem<T = any>(key: string, value: T): void;
    hasItem(key: string): boolean;
}

export interface IApplication extends ItemsContainer {
    middlewares: Middleware<any>[];
    createServer(secureOpts?: https.ServerOptions): MicroServer;
    createHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => void;
    use(...middlewares: (Middleware<any> | Router<any>)[]): IApplication;
    setErrorHandler(handler: ErrorHandler<any>): void;
    setFallbackHandler(handler: Middleware<any>): void;
}

export type Middleware<T extends Context = Context>
    = (context: T, next: NextMiddleware) => MiddlewareResult;
export type MiddlewareResult = Promise<void>;
export type NextMiddleware = () => MiddlewareResult;
export type ErrorHandler<T extends Context = Context>
    = (err: Error, req: http.IncomingMessage, res: http.ServerResponse, context?: T) => void;

export class Application<T extends Context = Context> implements IApplication {

    middlewares: Middleware<T>[] = [];
    items: Map<string, any>;

    constructor(
        private _contextFactory: (app: Application<T>,
            req: http.IncomingMessage, res: http.ServerResponse) => T,
        private _errorHandler: ErrorHandler<T> = utils.defaultErrorHandler,
        private _fallbackHandler = utils.defaultFallbackNotFoundHandler) { }

    createServer(secureOpts?: https.ServerOptions) {
        let isHttps = secureOpts ? true : false;
        const server = isHttps ?
            https.createServer(secureOpts, this.createHandler()) :
            http.createServer(this.createHandler());
        return attachServerExtensions(server);
    }

    createHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
        const fn = utils.compose(...this.middlewares);
        
        return (req, res) => {
            let errorHandler = this._errorHandler || utils.defaultErrorHandler;
            let fallbackHandler = this._fallbackHandler || utils.defaultFallbackNotFoundHandler;
            let context: T = null;
            try {
                context = this._contextFactory(this, req, res);
                fn(context, () => fallbackHandler(context, null))
                    .catch((err) => errorHandler(err, req, res, context));
            } catch (err) {
                errorHandler(err, req, res, context);
            }
        };
    }

    use(...middleware: (Middleware<T> | Router<T>)[]): Application<T> {
        if (!this.middlewares) this.middlewares = [];
        utils.addMiddlewares(middleware, this.middlewares);
        return this;
    }

    setErrorHandler(handler: ErrorHandler<T>) {
        this._errorHandler = handler;
    }

    setFallbackHandler(handler: Middleware<T>) {
        this._fallbackHandler = handler;
    }

    getItem<T = any>(key: string): T {
        if (this.items) {
            return this.items.get(key);
        }
        return null;
    }

    setItem<T = any>(key: string, value: T): void {
        if (!this.items) {
            this.items = new Map<string, any>();
        }
        this.items.set(key, value);
    }

    hasItem(key: string): boolean {
        if (this.items) {
            return this.items.has(key);
        }
        return false;
    }
}

export class App extends Application<Context> {
    constructor() {
        super(contextFactory);
    }
}