import * as http from "http";
import * as debugModule from "debug";
import * as net from "net";
import * as utils from "./utils";
import { Context } from "./context";
import { Router } from "./router";

export interface ItemsContainer {
    items: Map<string, any>;
    getItem(key: string): any;
    setItem(key: string, value: any): void;
    hasItem(key: string): boolean;
}

export interface IApplication extends ItemsContainer {
    middlewares: Middleware<any>[];
    listen(...args: any[]): any;
    getRequestListener(): (req: http.IncomingMessage, res: http.ServerResponse) => void;
    use(...middlewares: (Middleware<any> | Router<any>)[]): IApplication;
    setErrorHandler(handler: ErrorHandler<any>): void;
    setFallbackHandler(handler: Middleware<any>): void;
}

export type Middleware<T extends Context> = (context: T, next: NextMiddleware) => MiddlewareResult;
export type MiddlewareResult = Promise<void>;
export type NextMiddleware = () => MiddlewareResult;
export type ErrorHandler<T extends Context> = (err: Error, req: http.IncomingMessage, res: http.ServerResponse, context?: T) => void;

export class Application<T extends Context> implements IApplication {
    middlewares: Middleware<T>[] = [];
    items: Map<string, any>;
    private _socketClientErrorHandler: (err: any, socket: net.Socket) => void;

    constructor(
        private _contextFactory: (app: Application<T>,
            req: http.IncomingMessage, res: http.ServerResponse) => T,
        private _errorHandler: ErrorHandler<T> = utils.defaultErrorHandler,
        private _fallbackHandler = utils.defaultFallbackNotFoundHandler) {}

    listen(...args: any[]) {
        const server = http.createServer(this.getRequestListener());
        server.on("clientError", (err: any, socket: net.Socket) => {
            let handler = this._socketClientErrorHandler || utils.defaultClientErrorHandler;
            handler(err, socket);
        });
        return server.listen.apply(server, arguments);
    }

    getRequestListener(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
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

    setSocketClientErrorHandler(handler: (err: any, socket: net.Socket) => void) {
        this._socketClientErrorHandler = handler;
    }

    getItem(key: string): any {
        if (this.items) {
            return this.items.get(key);
        }
        return null;
    }

    setItem(key: string, value: any): void {
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

