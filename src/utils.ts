import { IContext, MiddlewareWithContext, Middleware, MiddlewareResult } from "./core";
import { Context } from "./app";
import * as url from "url";
import { Router } from "./router";
import * as debugModule from "debug";

const debug = debugModule("http-micro:utils");

/**
 * The default error handler. It's executed at the end of
 * the middleware chain or whenever, an exception that's
 * not caught by the application is encountered.
 * 
 * @export
 * @param {Error} err 
 */
export function defaultErrorHandler(err: Error) {
    const msg = err.stack || err.toString();
    console.error();
    console.error(`http-micro error: ${msg}`);
    console.error();
}

/**
 * The default fall-back handler. Simple ends the request, and returns.
 * 
 * @export
 * @param {IContext} context 
 * @param {MiddlewareWithContext} next 
 * @returns {Promise} Resolved Promise
 */
export function defaultFallbackHandler(context: IContext, next: MiddlewareWithContext) {
    debug("using fallback middleware");
    context.res.end();
    return Promise.resolve();
}

/**
 * Composes multiple middlewares into one middleware that executes the middleware chain.
 * 
 * @export
 * @template T {IContext}
 * @param {...Middleware<T>[]} middlewares 
 * @returns {Middleware<T>} 
 */
export function compose<T extends IContext>(...middlewares: Middleware<T>[]) : Middleware<T> {
    debug("composing middlewares");
    
    function dispatch(index: number,
        context: T,
        next: MiddlewareWithContext): MiddlewareResult {
        
        let c = middlewares[index];
        // If c doesn't exist then it's the end of the 
        // current middlechain. Simply pass on to the
        // next.
        if (!c) return next();
        let nextIndex = index + 1;
        // Check if the next middleware in the chain
        // exists, if it does, dispatch to chain, 
        // or else connect the 'next' to the chain
        // instead.
        let nextFn = nextIndex < middlewares.length ?
            () => dispatch(nextIndex, context, next) : next;
        return c(context, nextFn);
    }

    return (context, next) => dispatch(0, context, next);
}

/**
 * Mounts a middleware at a particular given path. If the request path starts
 * with the given path, then it's forwarded to the middleware chain. Though
 * not always the case, mount points should generally be considered as
 * self-contained services, especially when the mount point is Router,
 * which can have it's own middleware chain.
 *
 * When executing a mounted path, the routePath in the context is
 * stripped of the currently executing mount point, so that children can
 * use the paths that are relative to them. This follows a nesting behavior,
 * and is appropriately reset to original value as the execution comes
 * out of mounted points.
 *
 * A mount point can also provide yield back to the parent middleware
 * chain if the 'isRouteHandled' property of the context is false.
 * Routers automatically set them by calling 'markRouteHandled' on
 * matched routes. But they can be manually reset if needed for
 * advanced cases.
 *
 * Remarks: A Router can also be provided as a convenience, which is
 * automatically converted to middleware by calling `asMiddleware`.
 * 
 * @export
 * @template T 
 * @param {string} path 
 * @param {(Middleware<T> | Router<T>)} middleware 
 * @param {string} [debugName] 
 * @returns {Middleware<T>} 
 */
export function mount<T extends Context>(path: string,
    middleware: Middleware<T> | Router<T>, debugName? : string): Middleware<T> {
    let pathLength = path.length;
    // If the path ends with '/', then remove ensure that the slice retains a 
    // slash, so that router matching can still be performed relative to the 
    // route.
    if (path[pathLength - 1] === "/") pathLength--;

    // Setup debug name, and use the same for the router as well, if the 
    // provided argument is a router instead of a middleware.
    if (!debugName) debugName = "$" + path;
    let debug = debugModule("http-micro:utils:mount:" + debugName);
    // Ensure that, if the param is a router, it's converted to middleware.
    let mx = typeof middleware === "function" ?
        middleware as Middleware<T> : (middleware as Router<T>).asMiddleware(debugName);
    debug("type %s", typeof middleware === "function" ? "middleware" : "router");

    return (ctx, next) => {
        let routePath = ctx.getRoutePath();
        debug("test: route path: %s, mount path: %s", routePath, path);        
        if (!routePath.startsWith(path)) {
            return next();
        }
        let currentRoutePath = routePath.slice(pathLength);        
        debug("enter: %s", currentRoutePath);
        ctx.setRoutePath(currentRoutePath);
        let isRoutePathReset = false;

        let resetPathIfRequired = () => {
            if (!isRoutePathReset) {
                debug("exit: %s", currentRoutePath);
                ctx.setRoutePath(routePath);
                isRoutePathReset = true;
            }
        };
        return mx(ctx, () => {
            resetPathIfRequired();
            return ctx.isRouteHandled ? Promise.resolve() : next();
        }).then((res) => {
            resetPathIfRequired();
            return res;
        }, (err) => {
            resetPathIfRequired();     
            throw err;
        });
    };
}