export class RouteData {
    private _matches: RegExpMatchArray[] = null;
    params: any = null;

    add(match: RegExpMatchArray, params: any) {
        if (!this._matches) this._matches = [];
        this._matches.push(match);
        this.params = this.params || {};
        Object.assign(this.params, params);
    }

    getMatch(): RegExpMatchArray {
        return this._matches ? this._matches[0] : null;
    }

    getMatches() {
        return this._matches;
    }
}