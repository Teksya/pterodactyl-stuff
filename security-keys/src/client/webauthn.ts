/** Browser side of WebAuthn: the server's JSON options in, the authenticator's response out. */

type Json = Record<string, unknown>;

export function toBase64Url(buffer: ArrayBuffer): string {
    let binary = '';
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): ArrayBuffer {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return bytes.buffer;
}

const withIds = (list: unknown): Json[] | undefined =>
    Array.isArray(list) ? list.map((item: Json) => ({ ...item, id: fromBase64Url(String(item.id)) })) : undefined;

/** `navigator.credentials.create()` options from the server's JSON. */
export function creationOptions(json: Json): PublicKeyCredentialCreationOptions {
    const user = json.user as Json;

    return {
        ...json,
        challenge: fromBase64Url(String(json.challenge)),
        user: { ...user, id: fromBase64Url(String(user.id)) },
        excludeCredentials: withIds(json.excludeCredentials),
    } as unknown as PublicKeyCredentialCreationOptions;
}

/** `navigator.credentials.get()` options from the server's JSON. */
export function requestOptions(json: Json): PublicKeyCredentialRequestOptions {
    return {
        ...json,
        challenge: fromBase64Url(String(json.challenge)),
        allowCredentials: withIds(json.allowCredentials),
    } as unknown as PublicKeyCredentialRequestOptions;
}

/** The response of a key, encoded for the extension's endpoints. */
export function credentialJson(credential: PublicKeyCredential): Json {
    const response = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
    const encoded: Json = { clientDataJSON: toBase64Url(response.clientDataJSON) };

    if ('attestationObject' in response && response.attestationObject) {
        encoded.attestationObject = toBase64Url(response.attestationObject);
        encoded.transports = typeof response.getTransports === 'function' ? response.getTransports() : [];
    }
    if ('authenticatorData' in response && response.authenticatorData) {
        encoded.authenticatorData = toBase64Url(response.authenticatorData);
        encoded.signature = toBase64Url(response.signature);
        if (response.userHandle) encoded.userHandle = toBase64Url(response.userHandle);
    }

    return { id: credential.id, rawId: toBase64Url(credential.rawId), type: credential.type, response: encoded };
}

export function supportsWebAuthn(): boolean {
    return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function' && !!navigator.credentials;
}

/** Whether the user closed the browser prompt or let it time out, rather than something failing. */
export function isCancelled(error: unknown): boolean {
    return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');
}

/** A message for a failed ceremony: the browser's own errors are not meant for users. */
export function ceremonyError(error: unknown): string {
    if (error instanceof DOMException) {
        if (error.name === 'InvalidStateError') return 'This security key is already registered.';
        if (error.name === 'SecurityError') return 'Security keys only work on the panel’s own address, over HTTPS.';
        if (isCancelled(error)) return 'The security key request was cancelled or timed out.';
    }

    return 'The security key could not be used.';
}

/** Where to go after signing in: the login page's `redirect`, when it stays on the panel. */
export function redirectTarget(search: unknown, intended: string | undefined): string {
    const redirect = search && typeof search === 'object' ? (search as Json).redirect : undefined;

    if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\')) {
        return redirect;
    }

    return intended || '/';
}
