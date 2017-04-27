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

        let addrs;
        let forwardHeaders = this.req.headers['x-forwarded-for'] as string;

        if (forwardHeaders) {
            addrs = forwardHeaders
                .split(/ *, */)
                .filter(x => x);
            addrs.push(this.req.socket.remoteAddress);
        } else {
            addrs = [this.req.socket.remoteAddress];
        }
        return this._ipAddresses = addrs;
    }

    getHost(): string {
        let host = this.req.headers["x-forwarded-host"] || this.req.headers["host"];
        return stripBrackets(host);
        
        function stripBrackets(host: string) {
            // IPv6 uses [::]:port format.
            // Brackets are used to separate the port from
            // the address. In this case, remove the brackets,
            // and extract the address only.

            let offset = host[0] === '['
                ? host.indexOf(']') + 1
                : 0;
            let index = host.indexOf(':', offset);

            return index !== -1
                ? host.substring(0, index)
                : host;
        }
    }

    getProtocol(): string {
        return  this.isEncrypted() ? "https" : "http";
    }

    isEncrypted() {
        return (this.req.connection as any).encrypted ? true : false;
    }

    markRouteHandled() {
        this.isRouteHandled = true;
    }
}