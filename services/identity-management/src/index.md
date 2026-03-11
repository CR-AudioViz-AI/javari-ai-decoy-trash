# Deploy Enterprise Identity Management Service

# CR AudioViz AI - Enterprise Identity Management Service

## Purpose
The Enterprise Identity Management Service provides robust authentication and authorization functionalities for the CR AudioViz platform. It supports Single Sign-On (SSO) via SAML and OAuth2, Role-Based Access Control (RBAC), and integration with Active Directory, ensuring a secure environment for user management.

## Usage
To deploy the Identity Management Service, you need to set up an Express application with the necessary middleware and configuration details. This service handles user authentication, token generation, and role management.

## Parameters / Props
The following configuration parameters must be defined in order to utilize the Identity Management Service:

### `IdentityConfig`
- **supabase**: Object containing Supabase connection details.
  - `url`: Supabase API URL.
  - `serviceRoleKey`: Supabase service role key.
  
- **redis**: Object for Redis configuration.
  - `host`: Redis server hostname.
  - `port`: Redis server port number.
  - `password`: (Optional) Redis server password.
  - `cluster`: (Optional) Boolean indicating if Redis is clustered.
  
- **jwt**: Object containing JWT configuration.
  - `secret`: Secret for signing JWT tokens.
  - `accessTokenExpiry`: Token expiry time for access tokens.
  - `refreshTokenExpiry`: Token expiry time for refresh tokens.
  
- **saml**: Object for SAML configuration.
  - `entryPoint`: SAML endpoint URL.
  - `issuer`: Identifier for the service provider.
  - `cert`: Public certificate for SAML.
  - `privateKey`: Private key for SAML.

- **oauth2**: Object for OAuth2 configuration.
  - `clientId`: OAuth2 client ID.
  - `clientSecret`: OAuth2 client secret.
  - `redirectUri`: URI to which the service will redirect after authentication.
  - `scopes`: Array of scopes for OAuth2 permissions.

- **activeDirectory**: Object for Active Directory integration.
  - `url`: LDAP URL for AD.
  - `baseDn`: Base DN for AD queries.
  - `bindDn`: User DN for binding to AD.
  - `bindCredentials`: Password for binding.

- **security**: Object for security settings.
  - `bcryptRounds`: Number of rounds for bcrypt hashing.
  - `sessionTimeout`: Session timeout duration.
  - `maxLoginAttempts`: Maximum login attempts before lockout.

### User - Interface
Defines the structure of a user in the system.

- **id**: Unique identifier for the user.
- **email**: User's email address.
- **username**: User's username.
- **firstName**: User's first name.
- **lastName**: User's last name.
- **roles**: Array of role objects assigned to the user.
- **permissions**: Array of permission objects granted to the user.
- **provider**: Indicates the authentication provider (local, saml, oauth2, ad).
- **isActive**: Status indicating if the user account is active.
- **lastLogin**: (Optional) Timestamp of the last login.
- **createdAt**: Timestamp of account creation.
- **updatedAt**: Timestamp of last update.
- **metadata**: (Optional) Additional user information as key-value pairs.

## Return Values
The service returns various data types, including but not limited to:
- JWT tokens for authenticated users.
- User object upon successful login or registration.
- Error messages for failed authentication attempts.

## Examples
```typescript
// Example of creating a new user
const newUser: User = {
  id: uuidv4(),
  email: "john.doe@example.com",
  username: "johnny",
  firstName: "John",
  lastName: "Doe",
  roles: [],
  permissions: [],
  provider: 'local',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Example of a SSO login request handler
app.post('/auth/saml/login', async (req: Request, res: Response) => {
  // Implement SAML login logic here
});

// Example setting up Express middleware
const app: Application = express();
app.use(cors());
app.use(helmet());
app.use(compression());
```