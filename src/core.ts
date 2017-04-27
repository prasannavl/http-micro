import * as http from "http";
import * as debugModule from "debug";
import { defaultErrorHandler, defaultFallbackHandler, compose } from "./utils";

const debug = debugModule("http-micro:core");

export interface IApplication {
    middlewares: any;
    listen(...args: any[]): any;
    getRequestListener(): (req: http.IncomingMessage, res: http.ServerResponse) => void;
    use(middleware: any) : IApplication;
    setErrorHandler(handler: (err: Error) => void): void;
    setFallbackHandler(handler: any): void;
}

export interface IContext {
    req: http.IncomingMessage;
    res: http.ServerResponse;
    app: IApplication;
    getItems(): Map<string, any>;
}

export type Middleware<T extends IContext> = (context: T, next: MiddlewareWithContext) => MiddlewareResult;
export type MiddlewareResult = Promise<void>;
export type MiddlewareWithContext = () => MiddlewareResult;

export class ApplicationCore<T extends IContext> implements IApplication {
    middlewares: Middleware<T>[] = [];

    constructor(
        private _contextFactory: (app: ApplicationCore<T>,
            req: http.IncomingMessage, res: http.ServerResponse) => T,
        private _errorHandler = defaultErrorHandler,
        private _fallbackHandler = defaultFallbackHandler) {}

    listen(...args: any[]) {
        debug('listen');
        const server = http.createServer(this.getRequestListener());
        return server.listen.apply(server, arguments);
    }

    getRequestListener(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
        const fn = compose(...this.middlewares);
        return (req, res) => {
            let errorHandler = this._errorHandler || defaultErrorHandler;  
            let fallbackHandler = this._fallbackHandler || defaultFallbackHandler;            
            try {
                let context = this._contextFactory(this, req, res);
                fn(context, fallbackHandler.bind(null, context, null))
                    .catch(errorHandler);
            } catch (err) {
                errorHandler(err);
            }
        };
    }

    use(middleware: Middleware<T> | Middleware<T>[]) {
        this.middlewares = this.middlewares.concat(middleware);
        return this;
    }

    setErrorHandler(handler: (err: Error) => void) {
        this._errorHandler = handler;
    }

    setFallbackHandler(handler: Middleware<T>) {
        this._fallbackHandler = handler;
    }
}

