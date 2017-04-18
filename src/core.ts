import * as http from "http";
import * as debugModule from "debug";
import { defaultErrorHandler, defaultFinalHandler, compose } from "./utils";

const debug = debugModule("http-micro:core");

export interface IContext {
    req: http.IncomingMessage;
    res: http.ServerResponse;
}

export interface ContextConstructable<T extends IContext> {
    new (req: http.IncomingMessage, res: http.ServerResponse): T;
}

export type Middleware<T extends IContext> = (context: T, next: MiddlewareWithContext) => MiddlewareResult;
export type MiddlewareResult = Promise<void | string | number | NodeJS.ReadableStream | object>;
export type MiddlewareWithContext = () => MiddlewareResult;

export class ApplicationCore<T extends IContext> {
    middlewares: Middleware<T>[] = [];

    constructor(
        private _contextConstructor: ContextConstructable<T>,
        private _errorHandler = defaultErrorHandler,
        private _finalHandler = defaultFinalHandler) {
    }

    listen(...args: any[]) {
        debug('listen');
        const server = http.createServer(this.getRequestListener());
        return server.listen.apply(server, arguments);
    }

    getRequestListener(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
        const fn = compose(this.middlewares);
        return (req, res) => {
            let errorHandler = this._errorHandler || defaultErrorHandler;            
            try {
                let finalHandler = this._finalHandler || defaultFinalHandler;                
                let context = new this._contextConstructor(req, res);       
                fn(context, finalHandler.bind(null, context, null)).catch(errorHandler);
            } catch (err) {
                errorHandler(err);
            }
        };
    }

    use(middleware: Middleware<T>) {
        debug(`adding ${(middleware as any)._name || middleware.name || 'middleware'}`);
        this.middlewares.push(middleware);
        return this;
    }

    setErrorHandler(handler: (err: Error) => void) {
        this._errorHandler = handler;
    }

    setFinalHandler(handler: Middleware<T>) {
        this._finalHandler = handler;
    }
}

