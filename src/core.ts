import * as http from "http";
import * as debugModule from "debug";
import * as net from "net";
import * as utils from "./utils";

const debug = debugModule("http-micro:core");

export interface ItemsContainer {
    items: Map<string, any>;
    get(key: string): any;
    set(key: string, value: any): void;
    has(key: string): boolean;
}

export interface IApplication extends ItemsContainer {
    middlewares: any;
    listen(...args: any[]): any;
    getRequestListener(): (req: http.IncomingMessage, res: http.ServerResponse) => void;
    use(middleware: any): IApplication;
    setErrorHandler(handler: (err: Error) => void): void;
    setFallbackHandler(handler: any): void;
}

export interface IContext extends ItemsContainer {
    req: http.IncomingMessage;
    res: http.ServerResponse;
    app: IApplication;
}

export type Middleware<T extends IContext> = (context: T, next: MiddlewareWithContext) => MiddlewareResult;
export type MiddlewareResult = Promise<void>;
export type MiddlewareWithContext = () => MiddlewareResult;
export type ErrorHandler<T extends IContext> = (err: Error, req: http.IncomingMessage, res: http.ServerResponse, context?: T) => void;

export class ApplicationCore<T extends IContext> implements IApplication {
    middlewares: Middleware<T>[] = [];
    items: Map<string, any>;
    private _socketClientErrorHandler: (err: any, socket: net.Socket) => void;

    constructor(
        private _contextFactory: (app: ApplicationCore<T>,
            req: http.IncomingMessage, res: http.ServerResponse) => T,
        private _errorHandler: ErrorHandler<T> = utils.defaultErrorHandler,
        private _fallbackHandler = utils.defaultFallbackNotFoundHandler) {}

    listen(...args: any[]) {
        debug('listen');
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
                fn(context, fallbackHandler.bind(null, context, null))
                    .catch((err) => errorHandler(err, req, res, context));
            } catch (err) {
                errorHandler(err, req, res, context);
            }
        };
    }

    use(middleware: Middleware<T> | Middleware<T>[]) {
        this.middlewares = this.middlewares.concat(middleware);
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

    get(key: string): any {
        if (this.items) {
            return this.items.get(key);
        }
        return null;
    }

    set(key: string, value: any): void {
        if (!this.items) {
            this.items = new Map<string, any>();
        }
        this.items.set(key, value);
    }

    has(key: string): boolean {
        if (this.items) {
            return this.items.has(key);
        }
        return false;
    }
}

