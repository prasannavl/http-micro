import { IContext, Middleware, MiddlewareWithContext } from "./core";
import { Context } from "./context";
import { compose } from "./utils";
import * as debugModule from "debug";

const debug = debugModule("http-micro:router");

export class Router<T extends Context> {
    private _pathRoutes: Map<string, RouteMap<T>>;
    private _regExpRoutes: RouteMap<T>[];
    private _middlewares: Middleware<T>[];

    private _getPathRoutes() {
        return this._pathRoutes || (this._pathRoutes = new Map<string, RouteMap<T>>());
    }

    /**
     * Add a route for any http method. If a specific method,
     * for the same path is also provided, that always takes
     * precedence.
     *
     * @param route 
     * @param handler
     */
    any(route: Route, handler: Middleware<T>) {
        return this.define(route, HttpMethod.Any, handler);
    }

    /**
     * Add a route for Http GET method
     * @param route 
     * @param handler
     */
    get(route: Route, handler: Middleware<T>) {
        return this.define(route, HttpMethod.Get, handler);
    }

    /**
     * Add a route for Http PUT method
     * @param route 
     * @param handler
     */
    put(route: Route, handler: Middleware<T>) {
        return this.define(route, HttpMethod.Put, handler);
    }

    /**
     * Add a route for Http POST method
     * @param route 
     * @param handler
     */
    post(route: Route, handler: Middleware<T>) {
        return this.define(route, HttpMethod.Post, handler);
    }

    /**
     * Add a route for Http DELETE method
     * @param route 
     * @param handler
     */
    delete(route: Route, handler: Middleware<T>) {
        return this.define(route, HttpMethod.Delete, handler);
    }

    /**
     * Add a route for Http PATCH method
     * @param route 
     * @param handler
     */
    patch(route: Route, handler: Middleware<T>) {
        return this.define(route, HttpMethod.Patch, handler);
    }

    /**
     * Adds a middleware to the router. This is just like adding a
     * middleware to the application itself, and is executed whenever
     * the execution reaches the router - typically by entering the
     * mount point of the router's middleware.
     *
     * ```
     * app.use(mount("/api", router));
     * ```
     * Middleware is executed on the /api routes, regardless of whether
     * or not a route matches.
     *
     * @param middleware 
     */
    use(middleware: Middleware<T> | Middleware<T>[]) {
        if (this._middlewares) {
            this._middlewares = this._middlewares.concat(middleware);
        } else {
            this._middlewares = [].concat(middleware);
        }
        return this;
    }

    /**
     * Add a definition for a route for a Http method. This is the method
     * that's internally called for each of the 'get', 'post' etc, methods
     * on the router. They are just convenience methods for this method.
     *
     * @param route 
     * @param method {String} Preferably, use the HttpMethod helpers instead
     * of using raw strings. For breviety, only the common standard HTTP 1.1
     * methods are given there.
     *
     * @param handler 
     */
    define(route: Route, method: string, handler: Middleware<T>) {
        if (typeof route === "string") {
            this._defineStringRoute(route, method.toString(), handler);
        }
        return this;
    }

    private _defineStringRoute(route: string, method: string, handler: Middleware<T>) {
        let pathRoutes = this._getPathRoutes();
        let existing = pathRoutes.get(route);
        if (existing) {
            existing.set(method, handler);
        } else {
            let m = new RouteMap<T>();
            m.set(method, handler);
            pathRoutes.set(route, m);
        }
    }

    /**
     * Check if a path and method pair matches a defined route in 
     * the router, and if so return the route.
     *
     * It tries to match a specific route first, and if no routes are
     * found, tries to see if there's an 'Any' route that's provided,
     * to match all routes.
     *
     * If there are no matches, returns null. 
     *
     * @param {string} path 
     * @param {string} method 
     * @returns {Middleware<T>|null} 
     * 
     * @memberOf Router
     */

    match(path: string, method: string): Middleware<T> {
        let pathRoutes = this._getPathRoutes();
        let routeMap = pathRoutes.get(path);
        if (routeMap) {
            let handler = routeMap.get(method);
            if (handler) return handler as Middleware<T>;
            handler = routeMap.get(HttpMethod.Any);
            if (handler) return handler as Middleware<T>;
        }
        return null;
    }

    /**
     * Returns a middleware function that executes the router. It composes
     * the middlewares of the router when called and returns a middleware.
     *
     * When the middleware executes, the inner middleware chain is executed,
     * followed by matched route is a received as the 'next' middleware for
     * the last middleware in the chain, and the matched route also receives,
     * the parent chain as 'next', should the decide to continue the chain.
     *
     * Routers automatically mark route as handled with 'routeHandled'
     * when a route is matched, just before execution of the matched route.
     * So the matched route can reset it if needed for advanced cases.
     * 
     * @param debugName {string} This is an optional string that is helpful
     * when debugging route matches. It's used as a title for all debug
     * messages emitted from the router.
     */
    asMiddleware(debugName?: string): Middleware<T> {
        let debug = debugModule("http-micro:router:" + (debugName || "$"));
        let middlewares = this._middlewares || [];

        let handler = handleRoute.bind(this);

        return middlewares.length > 0 ?
            compose(...middlewares, handler) : handler;

        function handleRoute(ctx: T, next: MiddlewareWithContext): Promise<void> {
            if (ctx.routeHandled) return Promise.resolve();
            let method = ctx.getHttpMethod();
            let path = ctx.getRoutePath();
            debug("test: method: %s, path: %s", method, path);
            let handler = this.match(path, method);
            if (handler) {
                debug("match");
                ctx.markRouteHandled();
                return handler(ctx, next);
            }
            debug("no match");
            return next();
        }
    }
}

export type Route = string | RegExp;
export class RouteMap<T extends Context> extends Map<string, Middleware<T>> { }

export class HttpMethod {
    static Any = "*";
    static Get = "GET";
    static Head = "HEAD";
    static Post = "POST";
    static Put = "PUT";
    static Delete = "DELETE";
    static Patch = "PATCH";
    static Options = "OPTIONS";
    static Trace = "TRACE";
}
