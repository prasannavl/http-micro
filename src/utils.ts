import { IContext, MiddlewareWithContext, Middleware, MiddlewareResult } from "./core";
import { Context } from "./context";
import * as url from "url";
import { Router } from "./router";
import * as debugModule from "debug";
import * as net from "net";
import * as http from "http";
import * as pathToRegexp from "path-to-regexp";
import * as createError from "http-errors";

const debug = debugModule("http-micro:utils");

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
    const msg = err.stack || err.toString();
    console.error();
    console.error(`http-micro error: ${msg}`);
    console.error();
}

export function errorToResponse(err: Error, res: http.ServerResponse) {
    let errObj = err as any;
    let status = Number(errObj["status"]);
    if (status > 599 || status < 400)
        status = 500;
    
    if (!res.headersSent) {
        res.statusCode = status;
    }
    if (!res.finished)
        res.end();
}


/**
 * A default fall-back handler that simply ends the request, and returns.
 * 
 * @export
 * @param {IContext} context 
 * @param {MiddlewareWithContext} next 
 * @returns {Promise} Resolved Promise
 */
export function defaultFallbackOkHandler(context: IContext, next: MiddlewareWithContext) {
    debug("using fallback (ok) middleware");
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
export function defaultFallbackNotFoundHandler(context: IContext, next: MiddlewareWithContext) {
    debug("using fallback (not found) middleware");
    context.res.statusCode = 404;
    context.res.end(http.STATUS_CODES[404]);
    return Promise.resolve();
}


export function defaultClientErrorHandler(err: any, socket: net.Socket) {
    debug("client error: closing socket with bad request");
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
 * chain if the 'routeHandled' property of the context is false.
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
    middleware: Middleware<T> | Router<T>, debugName?: string): Middleware<T> {
    
    // TODO: Case insensitive path options
    let targetPath = path.endsWith("/") ? path.slice(0, -1) : path;
    let pathLength = targetPath.length;
    
    // Setup debug name, and use the same for the router as well, if the 
    // provided argument is a router instead of a middleware.
    if (!debugName) debugName = "$" + targetPath;
    let debug = debugModule("http-micro:utils:mount:" + debugName);
    // Ensure that, if the param is a router, it's converted to middleware.
    let mx = typeof middleware === "function" ?
        middleware as Middleware<T> : (middleware as Router<T>).asMiddleware(debugName);
    debug("type %s", typeof middleware === "function" ? "middleware" : "router");

    return (ctx, next) => {
        let routePath = ctx.getRoutePath();
        debug("test: route path: %s, mount path: %s", routePath, targetPath);        
        if (!routePath.startsWith(targetPath)) {
            return next();
        }
        // Remove the matched path from the current route. It doesn't matter, 
        // if it has traling slashes or not, since mount points 
        // always ignore them, while routers always prefix them, if it's not
        // already present - It's always consistent.
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
            return ctx.routeHandled ? Promise.resolve() : next();
        }).then((res) => {
            resetPathIfRequired();
            return res;
        }, (err) => {
            resetPathIfRequired();     
            throw err;
        });
    };
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

export function createRouteParams(match: RegExpMatchArray, keys: pathToRegexp.Key[], params?: any) {
    params = params || {};

    var key, param;
    for (var i = 0; i < keys.length; i++) {
        key = keys[i];
        param = match[i + 1];
        if (!param) continue;
        params[key.name] = decodeRouteParam(param);
        if (key.repeat) params[key.name] = params[key.name].split(key.delimiter)
    }
    return params;
}

export function decodeRouteParam(param: string) {
  try {
    return decodeURIComponent(param);
  } catch (_) {
    throw createError(400, 'failed to decode param "' + param + '"');
  }
}