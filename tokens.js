const jwt = require('jsonwebtoken');

function decodeTokenClaims(access_token) {
    return jwt.decode(access_token, {complete: true});
}

function getTokenExp(access_token) {
    return decodeTokenClaims(access_token).payload.exp;
}

function getTokenTenantId(access_token) {
    return decodeTokenClaims(access_token).payload['https://missione/octolabs/io/tenantIds'];
}

module.exports = {
    decodeTokenClaims,
    getTokenExp,
    getTokenTenantId
}