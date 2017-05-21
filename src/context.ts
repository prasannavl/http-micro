import { Middleware, IContext, IApplication, ApplicationCore } from "./core";
import { NodeContext } from "./core-node";
import * as http from "http";
import * as url from "url";
import { stringify } from "./utils";
import { isString } from "./lang";
import { RouteData } from "./route-data";

export class Context extends NodeContext {
    private _url: url.Url = null;
    private _ipAddresses: string[] = null;
    private _routePath: string = null;
    private _routeData: RouteData = null;
    
    routeHandled = false;

    sendAsJson(data: any,
        replacer?: (key: string, value: any) => any,
        spaces?: string | number) {
        let res = this.res;
        this.setHeader("Content-Type", "application/json", false);
        let payload = stringify(data, replacer, spaces);
        this.res.end(payload);
    }

    sendText(text: string) {
        this.setHeader("Content-Type", "text/plain", false);
        this.res.end(text);
    }

    sendStatus(code: number, message?: string) {
        this.setStatus(code, message);
        this.res.end();
    }

    setStatus(code: number, message?: string) {
        this.res.statusCode = code;
        if (message)
            this.res.statusMessage = message;
    }

    sendNoContent() {
        this.sendStatus(204);
    }

    sendResetContent() {
        this.sendStatus(205);
    }

    sendMethodNotAllowed(allowedMethods: string[], reason = http.STATUS_CODES[405]) {
        if (!allowedMethods)
            throw new Error("allowed methods must be present");
        let headers = {
            "Allow": allowedMethods.join(", ")
        };
        this.send(reason, headers, 405);
    }

    sendNotFound(reason = http.STATUS_CODES[404]) {
        this.send(reason, null, 404);
    }

    send(body: any, headers?: any, code = 200) {
        this.res.writeHead(code, null, headers);
        // TODO: Do proper content negotiation here.
        isString(body) ?
            this.sendText(body) :
            this.sendAsJson(body);
    }

    sendForbidden(reason: any) {
        this.send(reason, null, 401);
    }

    /**
     * Check if a request has a request body.
     * A request with a body __must__ either have `transfer-encoding`
     * or `content-length` headers set.
     * http://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.3
     *
     * @param {Object} request
     * @return {Boolean}
     */
    hasRequestbody() {
        let req = this.req;
        return req.headers['transfer-encoding'] !== undefined ||
            !isNaN(req.headers['content-length'])
    }

    setHeader(key: string, value: string, replace = true) {
        let res = this.res;
        if (!replace && res.getHeader(key)) return false;
        res.setHeader(key, value);
        return true;
    }

    /**
     * Appends a value item to a mutli-value header key. It separates
     * values with "," if there's an string value, or a appends to the
     * array if there's an existing array. If none exists, creates an
     * array with the item.
     *
     * @param key {String} The header key
     * @param value {String} The header value
     * @param forceAppend {Boolean} If true, the value will be appended
     * regardless of whether the value is already present or not.
     * Helpful performance optmization if it's known for certain
     * that a value will not exist, as it avoids a regex call.
     */
    appendHeaderValue(key: string, value: string, forceAppend = false) {
        let res = this.res;
        let existing = res.getHeader(key);
        if (!existing) {
            res.setHeader(key, [value]);
            return;
        }
        if (Array.isArray(existing)) {
            if (forceAppend ||
                !existing.includes(value)) {
                existing.push(value);
                res.setHeader(key, existing);
            }
        } else {
            // Header value is a string seperated by a ",".
            let shouldSet = true;
            if (!forceAppend) {
                let pattern = `(?: *, *)?${value}(?: *, *)?`;
                if (new RegExp(pattern).test(existing)) shouldSet = false;
            }
            if (shouldSet) res.setHeader(key, `${existing}, ${value}`);
        }
    }

    /**
     * Removes a value from a multi-value header item. Multi-values
     * header can either be a string separated by ", ", or an array.
     *
     * Note: The value provided should one be a single string, and
     * not an array.
     *
     * @param key {String} Key of the header.
     * @param value {String} The string value to be removed from the
     * header item.
     * @param removeHeaderIfEmpty {Boolean} If true, removes the entire
     * header, if the header is empty after removal of the item.
     */
    removeHeaderValue(key: string, value: string, removeHeaderIfEmpty = true) {
        let res = this.res;
        let existing = res.getHeader(key);
        if (!existing) return;

        if (Array.isArray(existing)) {
            let arr = existing as any as Array<string>;
            let index = arr.findIndex(x => x === value);
            if (index > -1) {
                arr.splice(index, 1);
                if (removeHeaderIfEmpty && arr.length === 0) res.removeHeader(key);
                else res.setHeader(key, arr);
            }
        } else {

            // Header value is a string seperated by a ",".
            // If both the comma's are present, replace the pattern with one
            // ", ". Or else, replace it with an empty string, and trim it.

            let pattern = `( *, *)?${value}( *, *)?`;
            let regex = new RegExp(pattern);
            let match = existing.match(regex);
            if (match) {
                // If match length is 3, then it means both ", " have been
                // matched. So, add one ",". Or else, either one of none 
                // of the comma has been matched. It's a safe assumption
                // to remove them entirely.
                let v = existing
                    .replace(match[0], match.length === 3 ? ", " : "")
                    .trim();

                if (!v && removeHeaderIfEmpty) res.removeHeader(key);
                else res.setHeader(key, v);
            }
        }
    }

    getUrl() {
        if (this._url === null) {
            this._url = url.parse(this.req.url);
        }
        return this._url;
    }

    getRoutePath() {
        if (this._routePath === null) {
            this._routePath = this.getUrl().pathname;
        }
        return this._routePath;
    }

    setRoutePath(path: string) {
        this._routePath = path;
    }
    
    getRouteData() {
        return this._routeData || (this._routeData = new RouteData());
    }

    getRouteParams() {
        return this.getRouteData().params;
    }

    setRouteData(value: RouteData) {
        this._routeData = value;
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
        return this.isEncrypted() ? "https" : "http";
    }

    isEncrypted() {
        return (this.req.connection as any).encrypted ? true : false;
    }

    markRouteHandled() {
        this.routeHandled = true;
    }
}

export function contextFactory(app: IApplication,
    req: http.IncomingMessage, res: http.ServerResponse) {
    return new Context(app, req, res);
}
