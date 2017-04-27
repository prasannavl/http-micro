import { Middleware, IContext, IApplication, ApplicationCore } from "./core";
import { NodeContext } from "./core-node";
import * as http from "http";
import * as url from "url";

export class Application extends ApplicationCore<Context> {
    constructor() {
        super(contextFactory);
    }
}

export function contextFactory(app: IApplication,
    req: http.IncomingMessage, res: http.ServerResponse) {
    return new Context(app, req, res);
}

export class Context extends NodeContext {
    private _url: url.Url;
    private _ipAddresses: string[];
    private _routePath: string;
    isRouteHandled = false;
    
    sendAsJson(data: any) {
        let res = this.res;
        this.setHeader("Content-Type", "application/json", false);
        this.res.end(JSON.stringify(data));
    }

    sendText(text: string) {
        this.setHeader("Content-Type", "text/plain", false);
        this.res.end(text);
    }

    setHeader(key: string, value: string, replace = true) {
        let res = this.res;
        if (!replace && res.getHeader(key)) return false;
        res.setHeader(key, value);
        return true;
    }

    appendHeader(key: string, value: string) {
        let res = this.res;
        let existing = res.getHeader(key);
        if (existing) {
            if (existing.indexOf(value) === -1)
                res.setHeader(key, `${existing}, ${value}`);
        } else {
            res.setHeader(key, value);
        }
    }

    getUrl() {
        return this._url || (this._url = url.parse(this.req.url));
    }

    getRoutePath() {
        return this._routePath || (this.getUrl().pathname);
    }

    setRoutePath(path: string) {
        this._routePath = path;
    }

    getHttpMethod() {
        // TODO: do method override.
        return this.req.method;
    }

    getClientIpAddress() {
        return this.getUpstreamIpAddresses()[0];
    }

    getUpstreamIpAddresses() {
        let existing = this._ipAddresses;
        if (existing) return existing;

        let req = this.req;
        let addrs;
        let forwardHeaders = req.headers['x-forwarded-for'] as string;

        if (forwardHeaders) {
            addrs = forwardHeaders
                .split(/ *, */)
                .filter(x => x);
        } else {
            addrs = [this.req.socket.remoteAddress];
        }
        return this._ipAddresses = addrs;
    }

    markRouteHandled() {
        this.isRouteHandled = true;
    }
}