class NotFound extends Error { constructor() { super("NEXT_NOT_FOUND"); this.digest = "NEXT_NOT_FOUND"; } }
class Redirect extends Error { constructor(url) { super("NEXT_REDIRECT " + url); this.digest = "NEXT_REDIRECT;" + url; this.url = url; } }
module.exports = { notFound() { throw new NotFound(); }, redirect(url) { throw new Redirect(url); }, NotFound, Redirect };
