export class ConflictError extends Error {
    constructor(message = "Data has been modified by another user.") {
        super(message);
        this.name = "ConflictError";
    }
}

export class NotFoundError extends Error {
    constructor(message = "Resource not found.") {
        super(message);
        this.name = "NotFoundError";
    }
}
