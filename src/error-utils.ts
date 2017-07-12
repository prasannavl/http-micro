import * as http from "http";
import * as os from "os";
import * as httpError from "http-errors";
import { ResponseUtils } from "./context-utils";

export const InnerErrorKey = "cause";
export const HttpErrorStatusCodeKey = "statusCode";

export function getErrorInfo(err: Error) {
    return err.stack || err.toString();
}

/**
 * Check if the status is a 4xx or 5xx status code.
 */
export function isHttpErrorStatusCode(code: number) {
    return Number.isInteger(code) && code > 399 && code < 600;
}

/**
 * Check if the status is a 4xx status code.
 */
export function isHttpClientErrorStatusCode(code: number) {
    return Number.isInteger(code) && code > 399 && code < 500;
}

/**
 * Check if the 'statusCode' property of error object
 * is a valid 4xx or 5xx status code. Return the code
 * if it is, or else return 500.
 */
export function getHttpErrorStatusCode(err: Error) {
    let errObj = err as any;
    let status = errObj[HttpErrorStatusCodeKey];
    if (!isHttpErrorStatusCode(status)) {
        return 500;
    }
    return status;
}

/**
 * Check if an error object is a valid http error, by
 * testing if 'statusCode' property of the error object
 * is a valid 4xx or 5xx status code.
 */
export function isHttpError(err: Error) {
    let errObj = err as any;
    let status = errObj[HttpErrorStatusCodeKey];
    return isHttpErrorStatusCode(status);
}

/**
 * Wrap an error into another error using the defacto
 * 'cause' property.
 */
export function wrapError(targetError: Error, originalError: Error, linkMessage = true) {
    (targetError as any)[InnerErrorKey] = originalError;
    if (linkMessage) targetError.message = originalError.message;
}

export function intoHttpError(err: Error, code?: number, forceCode = false) {
    let errObj: httpError.HttpError;
    if (isHttpError(err)) {
        let e = err as httpError.HttpError;
        if (!forceCode || code === e.statusCode) {
            errObj = e;
            return errObj;
        }
    }
    errObj = httpError(code);
    wrapError(errObj, err);
    return errObj;
}

export function errorToResponse(err: Error, res: http.ServerResponse) {
    let status = getHttpErrorStatusCode(err);
    if (!res.headersSent) {
        res.statusCode = status;
    }
    if (!res.finished) {
        // TODO: if ((err as any).expose) print error.
        res.end();
    }
}

export function makeNestedErrorIterable(err: Error) {
    return {
        [Symbol.iterator]() {
            let innerError = err;
            return {
                next: function () {
                    if (!innerError) return { done: true, value: null };
                    let value = innerError;
                    innerError = (innerError as any)[InnerErrorKey];
                    return { done: false, value };
                }
            }
        }
    }
}

export function* recurseErrorInfo(err: Error) {
    let iter = makeNestedErrorIterable(err);
    let i = -1;
    for (let e of iter) {
        if (i === -1) {
            yield `http-micro error: ${getErrorInfo(e)}`;
        } else {
            yield `-> cause[${i}]: ${getErrorInfo(e)}`;
        }
        i++;
    }
}