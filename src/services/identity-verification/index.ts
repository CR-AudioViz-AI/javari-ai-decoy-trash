```typescript
/**
 * @fileoverview Multi-Factor Identity Verification Microservice
 * @module IdentityVerificationService
 * @version 1.0.0
 * @description Comprehensive microservice handling multi-factor authentication, 
 * identity verification, and secure session management with support for various
 * authentication methods including SMS, email, TOTP, biometric, and hardware tokens.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import express, { Express, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

/**
 * Authentication types and interfaces
 */
export interface AuthUser {
  id: string;
  email: string;
  phoneNumber?: string;
  isVerified: boolean;
  mfaEnabled: boolean;
  mfaMethods: MFAMethod[];
  lastLogin?: Date;
  failedAttempts: number;
  lockedUntil?: Date;
  metadata: Record<string, any>;
}

export interface MFAMethod {
  id: string;
  type: 'sms' | 'email' | 'totp' | 'biometric' | 'hardware_token';
  isActive: boolean;
  secret?: string;
  phoneNumber?: string;
  email?: string;
  deviceId?: string;
  createdAt: Date;
  lastUsed?: Date;
}

export interface AuthSession {
  id: string;
  userId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  issuedAt: Date;
  expiresAt: Date;
  mfaVerified: boolean;
  refreshToken: string;
  metadata: Record<string, any>;
}

export interface VerificationChallenge {
  id: string;
  userId: string;
  type: 'sms' | 'email' | 'totp' | 'biometric';
  code?: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  metadata: Record<string, any>;
}

export interface BiometricData {
  templateId: string;
  deviceId: string;
  fingerprint?: string;
  faceTemplate?: string;
  voiceprint?: string;
  confidence: number;
}

export interface SecurityConfig {
  jwt: {
    secret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  mfa: {
    totpWindow: number;
    smsCodeLength: number;
    emailCodeLength: number;
    challengeExpiry: number;
  };
  rateLimit: {
    windowMs: number;
    maxAttempts: number;
    lockoutDuration: number;
  };
  session: {
    maxConcurrent: number;
    inactivityTimeout: number;
  };
}

/**
 * Crypto utilities for secure operations
 */
class CryptoUtils {
  private static readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_DERIVATION_ITERATIONS = 100000;

  /**
   * Generate secure random code
   */
  static generateCode(length: number): string {
    const chars = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[crypto.randomInt(0, chars.length)];
    }
    return result;
  }

  /**
   * Encrypt sensitive data
   */
  static encrypt(text: string, key: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.ENCRYPTION_ALGORITHM, key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  static decrypt(encryptedText: string, key: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipher(this.ENCRYPTION_ALGORITHM, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Hash password with salt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

/**
 * Validation utilities
 */
class Validators {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number format
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Validate TOTP code format
   */
  static isValidTOTPCode(code: string): boolean {
    const totpRegex = /^\d{6}$/;
    return totpRegex.test(code);
  }

  /**
   * Validate password strength
   */
  static isStrongPassword(password: string): boolean {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSymbols;
  }
}

/**
 * MFA Provider implementations
 */
class MFAProviders {
  private twilioClient: twilio.Twilio;
  private emailTransporter: nodemailer.Transporter;

  constructor(
    private config: SecurityConfig,
    twilioSid: string,
    twilioToken: string,
    emailConfig: any
  ) {
    this.twilioClient = twilio(twilioSid, twilioToken);
    this.emailTransporter = nodemailer.createTransporter(emailConfig);
  }

  /**
   * Send SMS verification code
   */
  async sendSMSCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      await this.twilioClient.messages.create({
        body: `Your verification code is: ${code}. Valid for 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });
      return true;
    } catch (error) {
      console.error('SMS sending failed:', error);
      return false;
    }
  }

  /**
   * Send email verification code
   */
  async sendEmailCode(email: string, code: string): Promise<boolean> {
    try {
      await this.emailTransporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: email,
        subject: 'Verification Code',
        html: `<p>Your verification code is: <strong>${code}</strong></p><p>Valid for 5 minutes.</p>`
      });
      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      return false;
    }
  }

  /**
   * Generate TOTP secret
   */
  generateTOTPSecret(userEmail: string): { secret: string; qrCode: string } {
    const secret = speakeasy.generateSecret({
      name: userEmail,
      issuer: 'CR AudioViz AI'
    });

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url || ''
    };
  }

  /**
   * Verify TOTP code
   */
  verifyTOTPCode(secret: string, code: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: this.config.mfa.totpWindow
    });
  }
}

/**
 * Biometric provider for biometric authentication
 */
class BiometricProvider {
  private biometricTemplates: Map<string, BiometricData> = new Map();

  /**
   * Register biometric template
   */
  async registerBiometric(
    userId: string,
    deviceId: string,
    biometricData: Partial<BiometricData>
  ): Promise<string> {
    const templateId = uuidv4();
    const template: BiometricData = {
      templateId,
      deviceId,
      confidence: 0,
      ...biometricData
    };

    this.biometricTemplates.set(`${userId}:${deviceId}`, template);
    return templateId;
  }

  /**
   * Verify biometric data
   */
  async verifyBiometric(
    userId: string,
    deviceId: string,
    biometricData: Partial<BiometricData>
  ): Promise<boolean> {
    const template = this.biometricTemplates.get(`${userId}:${deviceId}`);
    if (!template) return false;

    // Simulate biometric matching (replace with actual biometric SDK)
    const confidence = this.calculateBiometricConfidence(template, biometricData);
    return confidence >= 0.85; // 85% confidence threshold
  }

  /**
   * Calculate biometric confidence (mock implementation)
   */
  private calculateBiometricConfidence(
    template: BiometricData,
    input: Partial<BiometricData>
  ): number {
    // Mock confidence calculation - replace with actual biometric matching
    return Math.random() * 0.3 + 0.7; // Random between 0.7-1.0
  }
}

/**
 * Hardware token provider for hardware-based authentication
 */
class HardwareTokenProvider {
  private registeredTokens: Map<string, any> = new Map();

  /**
   * Register hardware token
   */
  async registerToken(
    userId: string,
    tokenId: string,
    publicKey: string
  ): Promise<boolean> {
    this.registeredTokens.set(`${userId}:${tokenId}`, {
      tokenId,
      publicKey,
      registeredAt: new Date()
    });
    return true;
  }

  /**
   * Verify hardware token challenge
   */
  async verifyToken(
    userId: string,
    tokenId: string,
    challenge: string,
    signature: string
  ): Promise<boolean> {
    const token = this.registeredTokens.get(`${userId}:${tokenId}`);
    if (!token) return false;

    try {
      // Verify signature using public key (mock implementation)
      const verify = crypto.createVerify('SHA256');
      verify.update(challenge);
      return verify.verify(token.publicKey, signature, 'base64');
    } catch (error) {
      return false;
    }
  }
}

/**
 * Session manager for secure session handling
 */
class SessionManager {
  constructor(
    private redis: Redis,
    private config: SecurityConfig
  ) {}

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    deviceId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthSession> {
    const sessionId = uuidv4();
    const refreshToken = crypto.randomBytes(32).toString('hex');
    
    const session: AuthSession = {
      id: sessionId,
      userId,
      deviceId,
      ipAddress,
      userAgent,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      mfaVerified: false,
      refreshToken,
      metadata: {}
    };

    await this.redis.setex(
      `session:${sessionId}`,
      86400, // 24 hours
      JSON.stringify(session)
    );

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AuthSession | null> {
    const sessionData = await this.redis.get(`session:${sessionId}`);
    if (!sessionData) return null;

    const session = JSON.parse(sessionData) as AuthSession;
    if (new Date() > new Date(session.expiresAt)) {
      await this.destroySession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update session MFA status
   */
  async updateSessionMFA(sessionId: string, mfaVerified: boolean): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    session.mfaVerified = mfaVerified;
    await this.redis.setex(
      `session:${sessionId}`,
      86400,
      JSON.stringify(session)
    );

    return true;
  }

  /**
   * Destroy session
   */
  async destroySession(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string): Promise<AuthSession[]> {
    const keys = await this.redis.keys('session:*');
    const sessions: AuthSession[] = [];

    for (const key of keys) {
      const sessionData = await this.redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData) as AuthSession;
        if (session.userId === userId) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }
}

/**
 * Identity verifier for comprehensive identity verification
 */
class IdentityVerifier {
  constructor(
    private redis: Redis,
    private mfaProviders: MFAProviders
  ) {}

  /**
   * Create verification challenge
   */
  async createChallenge(
    userId: string,
    type: 'sms' | 'email' | 'totp' | 'biometric',
    target?: string
  ): Promise<VerificationChallenge> {
    const challengeId = uuidv4();
    let code: string | undefined;

    if (type === 'sms' || type === 'email') {
      code = CryptoUtils.generateCode(6);
      
      if (type === 'sms' && target) {
        await this.mfaProviders.sendSMSCode(target, code);
      } else if (type === 'email' && target) {
        await this.mfaProviders.sendEmailCode(target, code);
      }
    }

    const challenge: VerificationChallenge = {
      id: challengeId,
      userId,
      type,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      attempts: 0,
      maxAttempts: 3,
      verified: false,
      metadata: { target }
    };

    await this.redis.setex(
      `challenge:${challengeId}`,
      300, // 5 minutes
      JSON.stringify(challenge)
    );

    return challenge;
  }

  /**
   * Verify challenge
   */
  async verifyChallenge(
    challengeId: string,
    code: string,
    additionalData?: any
  ): Promise<boolean> {
    const challengeData = await this.redis.get(`challenge:${challengeId}`);
    if (!challengeData) return false;

    const challenge = JSON.parse(challengeData) as VerificationChallenge;
    
    if (challenge.verified || challenge.attempts >= challenge.maxAttempts) {
      return false;
    }

    if (new Date() > new Date(challenge.expiresAt)) {
      await this.redis.del(`challenge:${challengeId}`);
      return false;
    }

    challenge.attempts++;

    let isValid = false;
    if (challenge.type === 'totp' && additionalData?.secret) {
      isValid = this.mfaProviders.verifyTOTPCode(additionalData.secret, code);
    } else if (challenge.code) {
      isValid = challenge.code === code;
    }

    if (isValid) {
      challenge.verified = true;
    }

    await this.redis.setex(
      `challenge:${challengeId}`,
      300,
      JSON.stringify(challenge)
    );

    return isValid;
  }
}

/**
 * Authentication engine - core authentication logic
 */
class AuthEngine {
  constructor(
    private supabase: SupabaseClient,
    private redis: Redis,
    private sessionManager: SessionManager,
    private identityVerifier: IdentityVerifier,
    private mfaProviders: MFAProviders,
    private biometricProvider: BiometricProvider,
    private hardwareTokenProvider: HardwareTokenProvider,
    private config: SecurityConfig
  ) {}

  /**
   * Authenticate user with credentials
   */
  async authenticate(
    email: string,
    password: string,
    deviceId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ user: AuthUser; session: AuthSession; requiresMFA: boolean }> {
    if (!Validators.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check rate limiting
    const rateLimitKey = `auth_attempts:${ipAddress}`;
    const attempts = await this.redis.get(rateLimitKey) || '0';
    
    if (parseInt(attempts) >= this.config.rateLimit.maxAttempts) {
      throw new Error('Too many authentication attempts');
    }

    // Get user from database
    const { data: userData, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !userData) {
      await this.redis.incr(rateLimitKey);
      await this.redis.expire(rateLimitKey, this.config.rateLimit.windowMs / 1000);
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await CryptoUtils.verifyPassword(password, userData.password_hash);
    if (!isValidPassword) {
      await this.redis.incr(rateLimitKey);
      await this.redis.expire(rateLimitKey, this.config.rateLimit.windowMs / 1000);
      throw new Error('Invalid credentials');
    }

    // Clear rate limiting on successful authentication
    await this.redis.del(rateLimitKey);

    const user: AuthUser = {
      id: userData.id,
      email: userData.email,
      phoneNumber: userData.phone_number,
      isVerified: userData.is_verified,
      mfaEnabled: userData.mfa_enabled,
      mfaMethods: userData.mfa_methods || [],
      lastLogin: userData.last_login,
      failedAttempts: userData.failed_attempts,
      lockedUntil: userData.locked_until,
      metadata: userData.metadata || {}
    };

    // Create session
    const session = await this.sessionManager.createSession(
      user.id,
      deviceId,
      ipAddress,
      userAgent
    );

    return {
      user,
      session,
      requiresMFA: user.mfaEnabled && user.mfaMethods.length > 0
    };
  }

  /**
   * Generate JWT tokens
   */
  generateTokens(user: AuthUser, session: AuthSession): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        sessionId: session.id,
        mfaVerified: session.mfaVerified
      },
      this.config.jwt.secret,
      { expiresIn: this.config.jwt.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        sessionId: session.id,
        type: 'refresh'
      },
      this.config.jwt.secret,
      { expiresIn: this.config.jwt.refreshTokenExpiry }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.config.jwt.secret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Setup MFA method
   */
  async setupMFA(
    userId: string,
    type: 'sms' | 'email' | 'totp' | 'biometric' | 'hardware_token',
    config: any
  ): Promise<any> {
    const methodId = uuidv4();
    let setupData: any = {};

    switch (type) {
      case 'totp':
        const totpSecret = this.mfaProviders.generateTOTPSecret(config.email);
        setupData = totpSecret;
        break;
      
      case 'biometric':
        const templateId = await this.biometricProvider.registerBiometric(
          userId,
          config.deviceId,
          config.biometricData
        );
        setupData = { templateId };
        break;
      
      case 'hardware_token':
        await this.hardwareTokenProvider.registerToken(
          userId,
          config.tokenId,
          config.publicKey
        );
        setupData = { tokenId: config.tokenId };
        break;
    }

    // Save MFA method to database
    await this.supabase
      .from('user_mfa_methods')
      .insert({
        id: methodId,
        user_id: userId,
        type,
        is_active: true,
        config: setupData,
        created_at: new Date().toISOString()
      });

    return { methodId, ...setupData };
  }
}

/**
 * Main Identity Verification Service
 */
export class IdentityVerificationService {
  private app: Express;
  private supabase: SupabaseClient;
  private redis: Redis;
  private logger: winston.Logger