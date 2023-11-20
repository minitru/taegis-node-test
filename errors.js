class ServiceCoreException extends Error {
    constructor(message, comments = [], nested_exception = null) {
        super(message);
        this.message = message;
        this.comments = comments;
        this.nested_exception = nested_exception;
    }

    toString() {
        let message = this.message;
        if (this.nested_exception) {
            const exc = this.nested_exception.name;
            message += `\nnested exception: [${exc} -> ${this.nested_exception.toString()}]`;
        }
        if (this.comments.length > 0) {
            const joined = this.comments.join("\n");
            message += `\ncomments:\n${joined}`;
        }
        return message;
    }
}

class InvalidAuthenticationMethod extends ServiceCoreException {}

class AccessTokenException extends ServiceCoreException {}

class MissingAccessTokenError extends AccessTokenException {}

class InvalidAccessTokenError extends AccessTokenException {}

class GraphQLNoRowsInResultSetError extends ServiceCoreException {}

class InvalidAccessTokenClaims extends ServiceCoreException {}

class InvalidGraphQLEndpoint extends ServiceCoreException {}

module.exports = {
    ServiceCoreException,
    InvalidAuthenticationMethod,
    AccessTokenException,
    MissingAccessTokenError,
    InvalidAccessTokenError,
    GraphQLNoRowsInResultSetError,
    InvalidAccessTokenClaims,
    InvalidGraphQLEndpoint,
};