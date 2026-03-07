import putter from "@heyputer/puter.js"; // don’t import the named export

export const signIn = async () => await putter.auth.signIn();

export const signOut = async () => await putter.auth.signOut(); // make async

export const getCurrentUser = async () => {
    try {
        return await putter.auth.getUser();
    } catch {
        return null;
    }
};