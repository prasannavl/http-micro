import { IContext, MiddlewareWithContext, Middleware, MiddlewareResult } from "./core";
import * as debugModule from "debug";

const debug = debugModule("http-micro:utils");

export function defaultErrorHandler(err: Error) {
    const msg = err.stack || err.toString();
    console.error();
    console.error(`http-micro error: ${msg}`);
    console.error();
}

export function defaultFinalHandler(context: IContext, next: MiddlewareWithContext) {
    debug("final middleware");
    context.res.end();
    return Promise.resolve();
}

export function compose<T extends IContext>(middlewares: Middleware<T>[]) : Middleware<T> {
    debug("composing middlewares");

    function dispatch(index: number,
        context: T,
        next: MiddlewareWithContext): MiddlewareResult {
        
        let c = middlewares[index];
        if (!c) return next();
        let nextIndex = index + 1;
        let nextFn = nextIndex < middlewares.length ?
            () => dispatch(nextIndex, context, next) : next;
        return c(context, nextFn);
    }

    return (context, next) => dispatch(0, context, next);
}