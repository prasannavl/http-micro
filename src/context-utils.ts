import { Middleware, IApplication, Application } from "./core";
import * as http from "http";
import * as url from "url";
import { stringify } from "./utils";
import { isString } from "./lang";
import { RouteContext } from "./route-context";
import * as bodyParser from "./body-parser";
import * as contentType from "content-type";
import { intoHttpError } from "./error-utils";

export class RequestUtils {
    static getUpstreamIpAddresses(req: http.IncomingMessage) {
        let addrs;
        let forwardHeaders = req.headers['x-forwarded-for'] as string;

        if (forwardHeaders) {
            addrs = forwardHeaders
                .split(/ *, */)
                .filter(x => x);
            addrs.push(req.socket.remoteAddress);
        } else {
            addrs = [req.socket.remoteAddress];
        }
        return addrs;
    }

    static getHost(req: http.IncomingMessage): string {
        let host = req.headers["x-forwarded-host"] || req.headers["host"];
        return stripHostBrackets(host);
    }

    static isEncrypted(req: http.IncomingMessage) {
        return (req.connection as any).encrypted ? true : false;
    }

    static getProtocol(req: http.IncomingMessage): string {
        return RequestUtils.isEncrypted(req) ? "https" : "http";
    }

    static getContentType(req: http.IncomingMessage) {
        let contentTypeHeader = req.headers["content-type"];
        let result: contentType.MediaType = null;
        if (contentTypeHeader) {
            try {
                result = contentType.parse(contentTypeHeader);
            } catch (err) {
                throw intoHttpError(err, 400);
            }
        }
        return result;
    }
}

export class ResponseUtils {
    static send(res: http.ServerResponse, body: any, headers?: any, code = 200) {
        ResponseUtils.setHeaders(res, headers);
        ResponseUtils.setStatus(res, code);
        if (!body) {
            res.end();
            return;
        }
        isString(body) ?
            ResponseUtils.sendText(res, body) :
            ResponseUtils.sendAsJson(res, body);
    }

    static sendText(res: http.ServerResponse, text: string) {
        ResponseUtils.setContentType(res, "text/plain");
        res.end(text);
    }

    static sendAsJson(res: http.ServerResponse, data: any,
        replacer?: (key: string, value: any) => any,
        spaces?: string | number) {
        ResponseUtils.setContentType(res, "application/json");
        let payload = stringify(data, replacer, spaces);
        res.end(payload);
    }

    static getResponseHeaders(res: http.ServerResponse) {
        return (res as any).getHeaders();
    }

    static setHeaders(res: http.ServerResponse, headers: any) {
        if (!headers) return;
        // Do the same thing that writeHead does, to ensure compatibility.
        let keys = Object.keys(headers);
        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];
            res.setHeader(key, headers[key]);
        }
    }

    static setHeader(res: http.ServerResponse, key: string, value: string, replace = true) {
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
    static appendHeaderValue(res: http.ServerResponse, key: string, value: string, forceAppend = false) {
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
    static removeHeaderValue(res: http.ServerResponse, key: string, value: string, removeHeaderIfEmpty = true) {
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
    
    static setContentType(res: http.ServerResponse, value: string, force = false) {
        if (res.headersSent) return;
        const ContentTypeKey = "Content-Type";
        ResponseUtils.setHeader(res, ContentTypeKey, value, force);
    }

    static setStatus(res: http.ServerResponse, code: number, message?: string) {
        res.statusCode = code;
        if (message)
            res.statusMessage = message;
    }

    static sendStatus(res: http.ServerResponse, code: number, message?: string, headers?: any) {
        ResponseUtils.setHeaders(res, headers);
        ResponseUtils.setStatus(res, code, message);
        res.end();
    }

    static sendMethodNotAllowed(res: http.ServerResponse, allowedMethods: string[] | string, reason: string = null, headers?: any) {
        let allowHeaderString;
        if (Array.isArray(allowedMethods)) {
            if (allowedMethods.length < 1)
                throw new Error("allowed methods invalid");
            allowHeaderString = allowedMethods.join(", ");
        } else {
            if (!allowedMethods)
                throw new Error("allowed methods parameter required");
            allowHeaderString = allowedMethods;
        }
        let mergedHeaders;
        let allowHeaders = {
            "Allow": allowHeaderString,
        }
        if (headers) {
            mergedHeaders = Object.assign({}, headers, allowHeaders);
        } else {
            mergedHeaders = allowHeaders;
        }
        ResponseUtils.sendStatus(res, 405, reason, mergedHeaders);
    }
}

function stripHostBrackets(host: string) {
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
