import { IContext, Middleware, MiddlewareWithContext } from "./core";
import { Context } from "./context";
import { compose } from "./utils";
import * as debugModule from "debug";
import * as pathToRegexp from "path-to-regexp";
import * as createError from "http-errors";

const debug = debugModule("http-micro:router");

export type MatchResult<T extends Context> = { handler: Middleware<T>, data: RegExpMatchArray, params: any };
export type Route = string | RegExp;
export class PathRouteMap<T extends Context> extends Map<string, Middleware<T>> { }
type RegExpRoute<T extends Context> = { test: RegExp, middleware: Middleware<T>, paramKeys: any };

export class Router<T extends Context> {

    static PathMatchOpts: pathToRegexp.RegExpOptions = { strict: true, sensitive: true };

    private _pathRoutes: Map<string, PathRouteMap<T>>;
    private _regExpRoutes: Map<string, Array<RegExpRoute<T>>>;
    private _middlewares: Middleware<T>[];

    private _getPathRoutes() {
        return this._pathRoutes || (this._pathRoutes = new Map<string, PathRouteMap<T>>());
    }

    private _getRegExpRoutes() {
        return this._regExpRoutes || (this._regExpRoutes = new Map<string, Array<RegExpRoute<T>>>());
    }

    /**
     * Add a route for any http method. If a specific method,
     * for the same path is also provided, that always takes
     * precedence.
     *
     * @param route 
     * @param handler
     */
    all(route: Route, handler: Middleware<T>) {
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
        let m = method.toString();
        if (m === HttpMethod.Any) {
            HttpMethod.CommonMethods
                .forEach(x => this.define(route, x, handler));
            return this;
        }
        if (typeof route === "string") {
            if (route.indexOf(":") === -1)
                this._defineStringRoute(route, m, handler);
            else
                this._definePathMatchRoute(route, m, handler);
        } else {
            this._defineRegExpRoute(route, m, handler, null);
        }
        return this;
    }

    private _definePathMatchRoute(route: string, method: string, handler: Middleware<T>) {
        let keys: pathToRegexp.Key[] = [];
        let re = pathToRegexp(route, keys, Router.PathMatchOpts);
        this._defineRegExpRoute(re, method, handler, keys);
    }

    private _defineStringRoute(route: string, method: string, handler: Middleware<T>) {
        let pathRoutes = this._getPathRoutes();
        let targetRoute = route.startsWith("/") ? route : "/" + route;
        let existing = pathRoutes.get(targetRoute);
        if (existing) {
            existing.set(method, handler);
        } else {
            let m = new PathRouteMap<T>();
            m.set(method, handler);
            pathRoutes.set(targetRoute, m);
        }
    }

    private _defineRegExpRoute(route: RegExp, method: string, handler: Middleware<T>, paramKeys: pathToRegexp.Key[]) {
        let routes = this._getRegExpRoutes();
        let methodRoutes = routes.get(method);
        if (!methodRoutes) {
            methodRoutes = new Array<RegExpRoute<T>>();
            routes.set(method, methodRoutes);
        }
        methodRoutes.push({ test: route, middleware: handler, paramKeys });
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

    match(path: string, method: string): MatchResult<T> {
        let targetPath = path.startsWith("/") ? path : "/" + path;
        return this._matchPathRoutes(this._pathRoutes, method, targetPath) ||
            this._matchRegExpRoutes(this._regExpRoutes, method, targetPath);
    }

    /**
     * Path routes are stored as TargetPath ---> METHOD ---> Handler
     */
    private _matchPathRoutes(routes: Map<string, PathRouteMap<T>>, method: string, targetPath: string)
        : MatchResult<T> {
        if (!routes) return null;
        let routeMap = routes.get(targetPath);
        if (!routeMap) return null;
        let result = routeMap.get(method);
        if (result) return { handler: result, data: null, params: null };
        return null;
    }

    /**
     * RegExp routes are stored as METHOD ---> RegExp ---> Handler
     */
    private _matchRegExpRoutes(routes: Map<string, Array<RegExpRoute<T>>>, method: string, targetPath: string)
        : MatchResult<T> {
        if (!routes) return null;
        let regExpList = routes.get(method);
        let result = this._matchRegExpRoute(regExpList, targetPath);
        if (result) return result;
        return null;
    }

    private _matchRegExpRoute(routeList: Array<RegExpRoute<T>>, targetPath: string)
        : MatchResult<T> {
        if (!routeList) return null;
        let result = null as MatchResult<T>;
        routeList.find(x => {
            let match = targetPath.match(x.test);
            if (match) {
                let params = x.paramKeys ? createRouteParams(match, x.paramKeys) : null;
                result = { handler: x.middleware, data: match, params };
                return true;
            }
            return false;
        });
        return result;
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

        let routeHandler = (ctx: T, next: MiddlewareWithContext): Promise<void> => {
            if (ctx.routeHandled) return Promise.resolve();
            let method = ctx.getHttpMethod();
            let path = ctx.getRoutePath();
            debug("test: method: %s, path: %s", method, path);
            let match = this.match(path, method);
            if (match) {
                let handler = match.handler;
                if (handler) {
                    debug("match");
                    ctx.markRouteHandled();
                    let routeData = ctx.getRouteData();
                    routeData.add(match.data, match.params);
                    return handler(ctx, next);
                }
            }
            debug("no match");
            return next();
        }

        return middlewares.length > 0 ?
            compose(...middlewares, routeHandler) : routeHandler;
    }
}

export class HttpMethod {

    static Get = "GET";
    static Head = "HEAD";
    static Post = "POST";
    static Put = "PUT";
    static Delete = "DELETE";
    static Patch = "PATCH";
    static Options = "OPTIONS";
    static Trace = "TRACE";

    static CommonMethods = [
        HttpMethod.Get,
        HttpMethod.Head,
        HttpMethod.Post,
        HttpMethod.Put,
        HttpMethod.Delete,
        HttpMethod.Patch];
    
    static Any = "*";
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
