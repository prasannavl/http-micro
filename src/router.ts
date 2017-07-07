import { Middleware, NextMiddleware } from "./core";
import { Context } from "./context";
import { dispatch, addMiddlewares } from "./utils";
import { RouteData } from "./route-data";
import * as debugModule from "debug";
import * as pathToRegexp from "path-to-regexp";
import * as createError from "http-errors";

export type PathRouteMap<T extends Context> = Map<string, RouteDescriptor<T>>;
export type RegExpRouteMap<T extends Context> = Array<RouteDescriptor<T>>;

export class RouteDescriptor<T extends Context> {
    test: RegExp;    
    definitions: IRouteDefinitionMap<T>;

    constructor(test: RegExp = null, definitions: IRouteDefinitionMap<T> = {}) {
        this.test = test;
        this.definitions = definitions;
    }
}

export interface IRouteDefinitionMap<T extends Context> {
    [method: string]: RouteDefinition<T>;
}

export class RouteDefinition<T extends Context> {
    handler: Middleware<T>;
    paramKeys: any;

    constructor(handler: Middleware<T>, paramKeys: any = null) {
        this.handler = handler;
        this.paramKeys = paramKeys;
    }
}

export interface MatchResult<T extends Context> {
    path: string;    
    router: Router<T>;
    route: RouteDefinition<T>;
    descriptor: RouteDescriptor<T>;
    data: RegExpMatchArray;
    params: any;
}

export type Route = string | RegExp;

export type RouterOpts = {
    strict?: boolean;
    sensitive?: boolean;
    end?: boolean;
    delimiter?: string;
    exhaustive?: boolean;
};

export class Router<T extends Context> {

    static Defaults: RouterOpts = { strict: true, end: false, sensitive: true, exhaustive: false };

    private _routes: RegExpRouteMap<T>;
    private _middlewares: Middleware<T>[];
    private _opts: RouterOpts;

    constructor(opts: RouterOpts = null) {
        if (opts) this._opts = Object.assign({}, Router.Defaults, opts);
    }

    get opts() {
        return this._opts || Router.Defaults;
    }

    get routes() {
        return this._routes || (this._routes = new Array<RouteDescriptor<T>>());
    }

    /**
     * Add a route for all http action methods. Basically,
     * add the route for each method in HttpMethod.ActionMethods
     *
     * @param route 
     * @param handler
     */
    all(route: Route, handler: Middleware<T>, opts?: RouterOpts) {
        HttpMethod.ActionMethods.forEach(x => {
            this.define(route, x, handler);
        });
        return this;
    }

    /**
     * Add a route for any action regardless of the method.
     * If a specific method for the same path is also provided,
     * that always takes precedence.
     * @param route 
     * @param handler
     */
    any(route: Route, handler: Middleware<T>, opts?: RouterOpts) {
        return this.define(route, HttpMethod.Wildcard, handler, opts);
    }

    /**
     * Add a route for Http GET method
     * @param route 
     * @param handler
     */
    get(route: Route, handler: Middleware<T>, opts?: RouterOpts) {
        return this.define(route, HttpMethod.Get, handler, opts);
    }

    /**
     * Add a route for Http PUT method
     * @param route 
     * @param handler
     */
    put(route: Route, handler: Middleware<T>, opts?: RouterOpts) {
        return this.define(route, HttpMethod.Put, handler, opts);
    }

    /**
     * Add a route for Http POST method
     * @param route 
     * @param handler
     */
    post(route: Route, handler: Middleware<T>, opts?: RouterOpts) {
        return this.define(route, HttpMethod.Post, handler, opts);
    }

    /**
     * Add a route for Http DELETE method
     * @param route 
     * @param handler
     */
    delete(route: Route, handler: Middleware<T>, opts?: RouterOpts) {
        return this.define(route, HttpMethod.Delete, handler, opts);
    }

    /**
     * Add a route for Http PATCH method
     * @param route 
     * @param handler
     */
    patch(route: Route, handler: Middleware<T>, opts?: RouterOpts) {
        return this.define(route, HttpMethod.Patch, handler, opts);
    }

    /**
     * Adds a middleware to the router. This is just like adding a
     * middleware to the application itself, and is executed whenever
     * the execution reaches the router.
     *
     */
    use(path: Route, router: Router<T>): Router<T>;
    use(path: Route, middleware: Middleware<T>): Router<T>;
    use(...middleware: (Middleware<T> | Router<T>)[]): Router<T>;
    use(...args: any[]) {
        if (args && args.length === 2) {
            let first = args[0];
            let second = args[1];
            if (typeof first === "string" || first instanceof RegExp) {
                let h = second instanceof Router ? second.build() : second; 
                this.any(first, h);
                return this;
            }
        }
        if (!this._middlewares) this._middlewares = [];        
        addMiddlewares(args, this._middlewares);
        return this;
    }

    /**
     * Add a definition for a route for a Http method. This is the method
     * that's internally called for each of the 'get', 'post' etc, methods
     * on the router. They are just convenience methods for this method.
     *
     * @param route 
     * @param method Preferably, use the HttpMethod helpers instead
     * of using raw strings. For breviety, only the common standard HTTP 1.1
     * methods are given there.
     *
     * @param handler
     */
    define(route: Route, method: string, handler: Middleware<T>, opts?: RouterOpts) {
        if (typeof handler !== "function") throw new TypeError("handler not valid");
        let m = method.toString();
        typeof route === "string" ?
            this._definePathMatchRoute(route, m, handler, opts) :
            this._defineRegExpRoute(route, m, handler, null, null);
        return this;
    }

    private _definePathMatchRoute(route: string, method: string, handler: Middleware<T>, opts?: RouterOpts) {
        let keys: pathToRegexp.Key[] = [];
        let re = pathToRegexp(route, keys, Object.assign({}, this.opts, opts));
        this._defineRegExpRoute(re, method, handler, route, keys);
    }

    private _defineRegExpRoute(route: RegExp, method: string, handler: Middleware<T>,
        path: string, paramKeys: pathToRegexp.Key[]) {
        let routes = this.routes;
        let existing = routes.find(x => x.test.source === route.source);
        if (!existing) {
            existing = new RouteDescriptor<T>(route);
            routes.push(existing);
        }
        existing.definitions[method] = new RouteDefinition<T>(handler, paramKeys);
    }

    /**
     * Check if a path and method pair matches a defined route in 
     * the router, and if so return the route.
     *
     * It tries to match a specific route first, and if no routes are
     * found, tries to see if there's an 'any' route that's provided,
     * to match all routes.
     *
     * If there are no matches, returns null. 
     *
     * @param {string} path 
     * @param {string} method 
     * @returns {MatchResult<T>|null}
     * 
     */

    match(path: string, method: string): MatchResult<T> {
        return this._match(this._routes, method, path);
    }

    private _match(routes: RegExpRouteMap<T>, method: string,
        targetPath: string)
        : MatchResult<T> {
        if (!routes) return null;
        let breakEarly = this.opts.exhaustive;
        for (let i = 0; i < routes.length; i++) {
            let x = routes[i];
            let match = targetPath.match(x.test);
            if (match) {
                let methodResult = x.definitions[method];
                if (!methodResult && method === HttpMethod.Head) {
                    methodResult = x.definitions[HttpMethod.Get];
                }
                if (!methodResult) {
                    methodResult = x.definitions[HttpMethod.Wildcard];
                }
                if (methodResult) {
                    let paramKeys = methodResult.paramKeys;
                    let params = paramKeys ?
                        createRouteParams(match, paramKeys) : null;
                    let result = {
                        router: this,
                        route: methodResult,
                        descriptor: x,
                        data: match,
                        params,
                        path: match[0],
                    };
                    return result;
                }
                if (breakEarly) break;
            }
        }
        return null;
    }

    /**
     * Returns a middleware function that executes the router. It composes
     * the middlewares of the router when called and returns one middleware
     * that executes the router pipeline.
     *
     */
    build() : Middleware<T> {
        return createRouteHandler(this);
    }
}

export function createRouteHandler<T extends Context>(
    router: Router<T>): Middleware<T> {
    return (context: T, next: NextMiddleware) => {
        return routeHandler(router, context, next);
    }
}

export function routeHandler<T extends Context>(
    router: Router<T>, context: T,
    next: NextMiddleware) {
    
    let routeData = context.getRouteData();
    let method = context.getHttpMethod();
    let path = routeData.getPendingRoutePath();
    let match = router.match(path, method);
    let middlewares = (router as any)._middlewares;

    if (match) {
        routeData.push(match);
        let isMatchReset = false;
        let resetIfNeeded = (passthrough?: any) => {
            if (!isMatchReset) {
                if (routeData.getCurrentMatch() === match)
                    routeData.pop();
                isMatchReset = true;
            }
            return passthrough;
        };

        let nextHandler = () => {
            resetIfNeeded();
            return next();
        };

        let errorHandler = (err: Error) => {
            resetIfNeeded(); throw err;
        };

        // 1. Use `nextHandler` to ensure that reset is done before `next` is called, so 
        // the next middleware has correct match context before it executes.
        // 2. Use a `resetIfNeeded` with `then`, to ensure that if the `next` was not called,
        // the reset still works as expected.
        // 3. Use a `catch` handler to ensure that it's reset on error.
        
        if (middlewares && middlewares.length > 0) {
            return dispatch(context,
                () => match.route.handler(context, nextHandler),
                middlewares)
                .then(resetIfNeeded)
                .catch(errorHandler);
        }
        return match.route.handler(context, nextHandler)
            .then(resetIfNeeded)
            .catch(errorHandler);
    }

    if (middlewares && middlewares.length > 0)
        return dispatch(context, next, middlewares);
    return next();
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

    static ActionMethods = [
        HttpMethod.Get,
        HttpMethod.Post,
        HttpMethod.Put,
        HttpMethod.Delete,
        HttpMethod.Patch];
    
    static Wildcard = "*";
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
