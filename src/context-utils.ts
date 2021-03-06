import { Middleware, IApplication, Application } from "./core";
import * as http from "http";
import * as url from "url";
import { stringify } from "./utils";
import { isString } from "./lang";
import { RouteContext } from "./route-context";
import * as bodyParser from "./body-parser";
import * as contentType from "content-type";
import { intoHttpError } from "./error-utils";
import * as stream from "stream";
import * as contentDisposition from "content-disposition";
import * as accepts from "accepts";

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
        return stripHostBrackets(<string>host);
    }

    static isEncrypted(req: http.IncomingMessage) {
        return (req.connection as any).encrypted ? true : false;
    }

    static getProtocol(req: http.IncomingMessage): string {
        return RequestUtils.isEncrypted(req) ? "https" : "http";
    }

    static getContentType(req: http.IncomingMessage) {
        let contentTypeHeader = req.headers["content-type"] as string;
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

    static parseBody<T>(req: http.IncomingMessage, opts: any, parser: bodyParser.Parser) {
        let contentStream;
        let parseOpts = opts;
        let contentEncoding = req.headers["content-encoding"] as string;
        let identityStream = true;
        if (contentEncoding) {
            contentEncoding = contentEncoding.toLowerCase();
            if (contentEncoding != "identity") {
                identityStream = false;
            }
        }
        
        if (identityStream) {
            contentStream = req;
            let contentLength = Number(req.headers["content-length"]);
            if (contentLength > 0) {
                if (!parseOpts || parseOpts.length === undefined)
                    parseOpts = Object.assign({}, parseOpts, { length: contentLength });
            }
        }
        else {
            contentStream = bodyParser.makeContentStream(req, contentEncoding);
        }
        return bodyParser.parseBody<T>(contentStream, opts, parser);
    }
}

export class ResponseUtils {
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
            let existingHeader = existing as string;
            if (!forceAppend) {
                let pattern = `(?: *, *)?${value}(?: *, *)?`;
                if (new RegExp(pattern).test(existingHeader)) shouldSet = false;
            }
            if (shouldSet) res.setHeader(key, `${existingHeader}, ${value}`);
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
            let existingHeader = existing as string;
            // Header value is a string seperated by a ",".
            // If both the comma's are present, replace the pattern with one
            // ", ". Or else, replace it with an empty string, and trim it.

            let pattern = `( *, *)?${value}( *, *)?`;
            let regex = new RegExp(pattern);
            let match = existingHeader.match(regex);
            if (match) {
                // If match length is 3, then it means both ", " have been
                // matched. So, add one ",". Or else, either one of none 
                // of the comma has been matched. It's a safe assumption
                // to remove them entirely.
                let v = existingHeader
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

    static send(res: http.ServerResponse, body: any, headers?: any, code?: number, formatter?: any) {
        ResponseUtils.setHeaders(res, headers);
        if (code != null)
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
        spaces?: string | number, encoding?: string) {
        ResponseUtils.setContentType(res, "application/json");
        let payload = stringify(data, replacer, spaces);
        res.end(payload);
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

    static setContentDisposition(res: http.ServerResponse,
        filename: string, type: DispositionKind | string = DispositionKind.Attachment) {
        res.setHeader("Content-Disposition", contentDisposition(filename, { type }));
    }

    static sendNoContent(res: http.ServerResponse, headers?: any) {
        ResponseUtils.sendStatus(res, 204, null, headers);
    }

    static sendResetContent(res: http.ServerResponse, headers?: any) {
        ResponseUtils.sendStatus(res, 205, null, headers);
    }

    static sendBadRequest(res: http.ServerResponse, body: any, headers?: any) {
        ResponseUtils.send(res, body, headers, 400);
    }

    static sendNotFound(res: http.ServerResponse, reason: string = null, headers?: any) {
        ResponseUtils.send(res, reason, headers, 404);
    }

    static sendForbidden(res: http.ServerResponse, reason: any, headers?: any) {
        ResponseUtils.send(res, reason, headers, 401);
    }
}

export enum DispositionKind {
    Attachment = "attachment",    
    Inline = "inline",
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
