import { NextMiddleware, Middleware, MiddlewareResult } from "./core";
import { Context } from "./context";
import * as url from "url";
import { Router, MatchResult } from "./router";
import * as debugModule from "debug";
import * as net from "net";
import * as http from "http";
import * as os from "os";
import { errorToResponse, recurseErrorInfo } from "./error-utils";

/**
 * The default error handler. It's executed at the end of
 * the middleware chain or whenever, an exception that's
 * not caught by the application is encountered.
 * 
 * @export
 * @param {Error} err 
 */
export function defaultErrorHandler(err: Error, req: http.IncomingMessage, res: http.ServerResponse) {
    errorToResponse(err, res);
    for (let msg of recurseErrorInfo(err)) {
        console.error(msg + os.EOL);
    }
}

/**
 * A default fall-back handler that simply ends the request, and returns.
 * 
 * @export
 * @param {IContext} context 
 * @param {MiddlewareWithContext} next 
 * @returns {Promise} Resolved Promise
 */
export function defaultFallbackOkHandler(context: Context, next: NextMiddleware) {
    context.res.end();
    return Promise.resolve();
}

/**
 * The default fall-back handler that ends the request with 404 status code.
 * 
 * @export
 * @param {IContext} context 
 * @param {MiddlewareWithContext} next 
 * @returns {Promise} Resolved Promise
 */
export function defaultFallbackNotFoundHandler(context: Context, next: NextMiddleware) {
    context.res.statusCode = 404;
    context.res.end();
    return Promise.resolve();
}

export function defaultClientSocketErrorHandler(err: any, socket: net.Socket) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
}

/**
 * Composes multiple middlewares into one middleware that executes the middleware chain.
 * 
 * @export
 * @template T {IContext}
 * @param {...Middleware<T>[]} middlewares 
 * @returns {Middleware<T>} 
 */
export function compose(...middlewares: Middleware<any>[]) : Middleware<any> {
    return (context, next) => dispatch(context, next, middlewares);
}

export function dispatch(context: Context, next: NextMiddleware, middlewares: Middleware<any>[]) {
    // Take the allocation-free path when no middlewares exist.
    if (middlewares.length === 0) {
        return next();
    }

    let currentIndex = 0;
    let run = (): Promise<void> => {
        // Check if the next middleware in the chain
        // exists, if it does, dispatch to chain, 
        // or else connect the 'next' to the chain
        // instead.
        if (currentIndex < middlewares.length) {
            let c = middlewares[currentIndex];
            if (c) {
                currentIndex = currentIndex + 1;
                return c(context, run);
            }
        }
        return next();
    }
    return run();
}

/**
 * Stringify JSON, like JSON.stringify, but v8 optimized.
 */
export function stringify(value: any,
    replacer: (key: string, value: any) => any,
    spaces: string | number) {
  // v8 checks arguments.length for optimizing simple call
  // https://bugs.chromium.org/p/v8/issues/detail?id=4730
  return replacer || spaces
    ? JSON.stringify(value, replacer, spaces)
    : JSON.stringify(value);
}

export function addMiddlewares(middlewares: (Middleware<any> | Router<any>)[], destination: Middleware<any>[]) {
    if (!middlewares) return;
    let len = middlewares.length;
    let dlength = destination.length;
    destination.length = dlength + len;
    for (var i = 0; i < len; i++) {
        var current = middlewares[i];
        let handler = current instanceof Router ? current.build() : current;
        destination[i + dlength] = handler;
    }
}