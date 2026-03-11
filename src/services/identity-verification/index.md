# Deploy Multi-Factor Identity Verification Microservice

# Multi-Factor Identity Verification Microservice

## Purpose
The Multi-Factor Identity Verification Microservice provides a robust solution for handling multi-factor authentication (MFA) and identity verification. It supports various authentication methods including SMS, email, TOTP (Time-Based One-Time Password), biometrics, and hardware tokens. It also manages secure session handling and user verification status effectively.

## Usage
To utilize the Identity Verification Microservice, you need to integrate it within your application backend. This service can be used for user authentication, session management, and enforcement of security policies related to MFA.

## Parameters/Props

The service includes the following key interfaces:

### AuthUser
- `id` (string): Unique identifier for the user.
- `email` (string): User's email address.
- `phoneNumber` (string, optional): User's phone number.
- `isVerified` (boolean): Indicates if the user is verified.
- `mfaEnabled` (boolean): Indicates if the user has MFA enabled.
- `mfaMethods` (MFAMethod[]): List of enabled MFA methods.
- `lastLogin` (Date, optional): Timestamp of the last login.
- `failedAttempts` (number): Number of failed login attempts.
- `lockedUntil` (Date, optional): Timestamp until the account is locked.
- `metadata` (Record<string, any>): Additional information about the user.

### MFAMethod
- `id` (string): Unique identifier for the MFA method.
- `type` ('sms' | 'email' | 'totp' | 'biometric' | 'hardware_token'): Type of MFA method.
- `isActive` (boolean): Indicates if the method is currently active.
- `secret` (string, optional): Secret used for TOTP or biometric verification.
- `phoneNumber` (string, optional): Phone number associated with SMS method.
- `email` (string, optional): Email associated with email verification.
- `deviceId` (string, optional): Device identifier for biometric or hardware token.
- `createdAt` (Date): Timestamp of when the method was created.
- `lastUsed` (Date, optional): Timestamp of when the method was last used.

### AuthSession
- `id` (string): Unique session identifier.
- `userId` (string): The ID of the user associated with the session.
- `deviceId` (string): ID of the device being used.
- `ipAddress` (string): IP address from which the user is connecting.
- `userAgent` (string): Browser or device information.
- `issuedAt` (Date): When the session was created.
- `expiresAt` (Date): When the session will expire.
- `mfaVerified` (boolean): Status of MFA verification.
- `refreshToken` (string): Token for refreshing the session.
- `metadata` (Record<string, any>): Additional session data.

### VerificationChallenge
- `id` (string): Unique identifier for the verification challenge.
- `userId` (string): The ID of the user associated with the challenge.
- `type` ('sms' | 'email' | 'totp' | 'biometric'): Type of challenge.
- `code` (string, optional): Verification code.
- `expiresAt` (Date): When the challenge will expire.
- `attempts` (number): Number of attempts made.
- `maxAttempts` (number): Maximum attempts allowed for verification.
- `verified` (boolean): Indicates if the challenge has been verified.
- `metadata` (Record<string, any>): Additional challenge data.

## Return Values
The microservice functions will return objects corresponding to the defined interfaces, handling authentication, session management, and verification process results.

## Examples
1. **Creating a new user**:
   Call the function to register a new user, which will return an `AuthUser` object.

2. **Sending a verification code**:
   Invoke the method to send a verification code via SMS or email, receiving a `VerificationChallenge` object in response.

3. **Verifying a user's code**:
   Call the verification function, which will return whether the authentication was successful, along with an updated `AuthSession`. 

This microservice ensures that user identification is secure and reliable through its multifunctional capabilities.