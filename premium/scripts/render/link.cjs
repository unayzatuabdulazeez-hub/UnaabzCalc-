const React = require("react");
function Link({ href, children, ...p }) { return React.createElement("a", { href: typeof href === "string" ? href : String(href), ...p }, children); }
module.exports = Link; module.exports.default = Link;
