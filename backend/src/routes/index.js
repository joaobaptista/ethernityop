/**
 * routes/index.js
 * Aggregates all domain routers — mirrors the backend's api_router.
 */
import { Router } from 'express';
import authRouter from './auth.js';
import usersRouter from './users.js';
import messagesRouter from './messages.js';
import uploadRouter from './upload.js';
import subscriptionsRouter from './subscriptions.js';
import googlePhotosRouter from './googlePhotos.js';
import vaultMediaRouter from './vaultMedia.js';
import adminRouter from './admin.js';
import capsulesRouter from './capsules.js';
import guardiansRouter from './guardians.js';
import memoriesRouter from './memories.js';

const api = Router();
api.use(capsulesRouter); // /capsules/*
api.use(guardiansRouter); // /guardians/*
api.use(memoriesRouter); // /memories/*
api.use(authRouter); // POST /register, /login
api.use(usersRouter); // GET/PUT /profile
api.use(messagesRouter); // /messages/*
api.use(uploadRouter); // /upload/
api.use(subscriptionsRouter); // /subscriptions/*
api.use(googlePhotosRouter); // /google-photos/*
api.use(vaultMediaRouter); // /vault/media/*
api.use(adminRouter); // /admin/*

export default api;