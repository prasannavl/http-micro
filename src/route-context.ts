import { RouteDescriptor, RouteDefinition, MatchResult } from "./router";

export class RouteContext {
    params: any = null;    
    private _matches: MatchResult<any>[];
    private _pendingRoutePath: string;
    private _currentMatch: MatchResult<any>;

    constructor(pathname: string) {
        this._pendingRoutePath = pathname;
    }

    push(match: MatchResult<any>) {
        if (this._matches) {
            this._matches.push(match);
        } else {
            this._matches = [match];
        }
        if (match.params) {
            if (!this.params) this.params = {};
            Object.assign(this.params, match.params);
        }
        if (match.path) {
            this._setPendingRoutePath(this.getPendingRoutePath().slice(match.path.length));
        }
        this._currentMatch = match;
    }

    pop() {
        let m = [].pop.call(this._matches) as MatchResult<any>;
        this._currentMatch = this._getLastMatch();
        this._setPendingRoutePath(m.path + this.getPendingRoutePath());
        return m;
    }

    getPendingRoutePath() {
        return this._pendingRoutePath;
    }

    getMatches() {
        return this._matches;
    }

    getCurrentMatch() {
        return this._currentMatch;
    }

    private _setPendingRoutePath(value: string) {
        this._pendingRoutePath = value;
    }

    private _getLastMatch() {
        let matches = this.getMatches();
        if (matches) {
            let len = matches.length;
            if (len > 0) return matches[len - 1];
        }
        return null;
    }
}