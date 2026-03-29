# Video Streaming Platform - Backend Server

> A production-ready NestJS backend API for a video streaming and live streaming platform with Google OAuth authentication, JWT tokens, and Redis session management.

## 📋 Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [Authentication](#authentication)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Features](#features)
- [Development Guide](#development-guide)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

A high-performance video streaming platform backend built with **NestJS 11**, featuring:

- 🔐 **Google OAuth 2.0** authentication with JWT tokens
- 🔄 **Session Management** using Redis with refresh token rotation
- 📊 **GraphQL API** for real-time data fetching
- 🗄️ **PostgreSQL** database with Prisma ORM
- 🛡️ **Security** with bcrypt hashing, HTTP-only cookies, CSRF protection
- 📈 **Scalable** modular architecture with dependency injection
- ⚡ **Fast** asynchronous operations with proper error handling

**Status**: Production-ready authentication system with skeleton for video streaming features.

---

## 🛠️ Technology Stack

### Core Framework

- **NestJS 11.0.1** - Scalable Node.js framework
- **TypeScript 5.7.3** - Type-safe JavaScript
- **Express 5.0.0** - Web framework integration

### GraphQL & APIs

- **Apollo Server 5.4.0** - GraphQL server
- **@nestjs/graphql 13.2.4** - NestJS GraphQL integration
- **graphql 16.13.1** - GraphQL query language

### Authentication & Security

- **@nestjs/jwt 11.0.2** - JWT handling
- **@nestjs/passport 11.0.5** - Authentication strategy
- **passport-jwt 4.0.1** - JWT strategy
- **google-auth-library 10.6.1** - Google OAuth verification
- **bcryptjs** - Secure password/token hashing
- **cookie-parser 1.4.7** - HTTP cookie parsing

### Database

- **@prisma/client 7.4.2** - ORM and type-safe database access
- **prisma 7.4.2** - Database schema management
- **pg 8.20.0** - PostgreSQL driver
- **@prisma/adapter-pg 7.4.2** - PostgreSQL adapter

### Caching & Sessions

- **ioredis 5.10.1** - Redis client
- **Redis** - Session and token storage

### Configuration & Validation

- **@nestjs/config 4.0.3** - Environment configuration
- **class-validator** - Input validation
- **class-transformer** - Data transformation

### Development Tools

- **ESLint 9.18.0** - Code linting
- **Prettier 3.4.2** - Code formatting
- **Jest 30.0.0** - Testing framework
- **ts-jest 29.2.5** - TypeScript Jest integration

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                        │
│                                                                   │
│  (Web/Mobile) ────► GraphQL/REST API Requests                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NESTJS APPLICATION SERVER                     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    HTTP/GraphQL Layer                    │   │
│  │  (Express + Apollo Server + Cookie Parser)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌───────────┬──────────┬───┴──────┬──────────┐                 │
│  ▼           ▼          ▼          ▼          ▼                  │
│ ┌────────┐┌────────┐┌────────┐┌────────┐┌──────────┐           │
│ │ Auth   ││ User   ││Prisma  ││Redis   ││Exception │           │
│ │Module  ││Module  ││Module  ││Module  ││Filter    │           │
│ └────────┘└────────┘└────────┘└────────┘└──────────┘           │
│                              │                                    │
│  ┌──────────────────────────┴──────────────────────────────┐   │
│  │           SERVICE LAYER (Business Logic)               │   │
│  │                                                          │   │
│  │ ┌──────────────────────────────────────────────────┐   │   │
│  │ │ AuthService    - JWT, Google OAuth, Sessions    │   │   │
│  │ │ UserService    - User management                │   │   │
│  │ │ PrismaService  - Database connection            │   │   │
│  │ │ RedisService   - Session & cache management     │   │   │
│  │ └──────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌───────────────────────────┴─────────────────────────────┐   │
│  │    DATA PERSISTENCE LAYER (Database + Cache)           │   │
│  │                                                          │   │
│  │  ┌──────────────────────────┐  ┌─────────────────────┐ │   │
│  │  │  PostgreSQL Database     │  │  Redis Cache        │ │   │
│  │  │  - Users                 │  │  - Sessions         │ │   │
│  │  │  - Videos                │  │  - Tokens           │ │   │
│  │  │  - Subscriptions         │  │  - User Data        │ │   │
│  │  │  - Watch History         │  │                     │ │   │
│  │  │  - Hashtags              │  │                     │ │   │
│  │  └──────────────────────────┘  └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Module Dependency Graph

```
┌─────────────────┐
│   App Module    │
└────────┬────────┘
         │
    ┌────┴─────────────────────┬────────────────────────┐
    ▼                           ▼                        ▼
┌──────────────┐         ┌──────────────┐      ┌──────────────┐
│ Auth Module  │         │ User Module  │      │Config Module │
└──────┬───────┘         └──────┬───────┘      └──────────────┘
       │                        │
       └────────────┬───────────┘
                    ▼
          ┌──────────────────┐
          │ Prisma Module    │
          │ Redis Module     │
          └──────────────────┘
                    ▼
          ┌──────────────────┐
          │PostgreSQL + Redis│
          └──────────────────┘
```

---

## 📁 Project Structure

```
Server/
├── src/
│   ├── main.ts                          # Application bootstrap entry point
│   ├── app.module.ts                    # Root module configuration
│   ├── app.controller.ts                # Health check endpoint
│   ├── app.service.ts                   # Root service
│   │
│   ├── auth/                            # Authentication Module
│   │   ├── auth.module.ts               # Module configuration
│   │   ├── auth.service.ts              # OAuth, JWT, session logic
│   │   ├── auth.resolver.ts             # GraphQL resolvers
│   │   ├── decorator/
│   │   │   └── current-user.decorator.ts # Extract user from context
│   │   ├── guard/
│   │   │   └── gql-auth.guard.ts        # JWT authentication guard
│   │   ├── strategy/
│   │   │   └── jwt.strategy.ts          # Passport JWT strategy
│   │   └── type/
│   │       ├── auth-payload.type.ts     # Auth response type
│   │       └── session.type.ts          # Session data type
│   │
│   ├── user/                            # User Module
│   │   ├── user.module.ts               # Module configuration
│   │   ├── user.service.ts              # User business logic
│   │   ├── user.resolver.ts             # GraphQL resolvers
│   │   └── type/
│   │       └── user.type.ts             # User GraphQL type
│   │
│   ├── prisma/                          # Database Module
│   │   ├── prisma.module.ts             # Module configuration
│   │   └── prisma.service.ts            # Prisma client wrapper
│   │
│   ├── redis/                           # Caching Module
│   │   ├── redis.module.ts              # Module configuration
│   │   └── redis.service.ts             # Redis operations (get/set/del)
│   │
│   ├── config/                          # Configuration
│   │   └── env.validation.ts            # Environment validation schema
│   │
│   ├── common/                          # Common Utilities
│   │   └── filters/
│   │       └── all-exceptions.filter.ts # Global exception handler
│   │
│   └── schema.gql                       # Auto-generated GraphQL schema
│
├── prisma/
│   ├── schema.prisma                    # Database schema definition
│   └── migrations/                      # Database migrations
│       ├── migration_lock.toml
│       ├── 20250321104400_init/
│       ├── 20250321105400_users_email/
│       ├── 20250321185910_add_models/
│       └── 20250321185920_refresh_token/
│
├── dist/                                # Compiled JavaScript (build output)
├── coverage/                            # Test coverage reports
│
├── .env                                 # Environment variables (local)
├── .env.example                         # Environment template
├── .eslintrc.js                         # ESLint configuration
├── .prettierrc                          # Prettier formatting rules
├── tsconfig.json                        # TypeScript configuration
├── package.json                         # NPM dependencies & scripts
├── package-lock.json                    # Dependency lock file
├── jest.config.js                       # Jest testing configuration
├── docker-compose.yml                   # Docker services configuration
│
├── Fixing.md                            # Audit report with fixes
└── README.md                            # This file
```

### File Statistics

- **Total TypeScript Files**: 23
- **Lines of Code**: ~2,000+ (excluding tests)
- **Service Files**: 4 (Auth, User, Prisma, Redis)
- **Resolver/Controller Files**: 2 (Auth, User)
- **Database Models**: 6 (User, Video, Subscription, WatchHistory, Hashtag, RefreshToken)
- **API Endpoints**: 6 total (2 Queries, 4 Mutations, 1 REST)

---

## 🗄️ Database Schema

### Entity-Relationship Diagram

```
┌──────────────────────┐
│       User           │
├──────────────────────┤
│ id: String (PK)      │◄──┐
│ userEmail: String    │   │
│ userPassword: String │   │ 1:N
│ createdAt: DateTime  │   │
│ updatedAt: DateTime  │   │
└──────────────────────┘   │
         │                 │
         │ 1:N             │
         ├────────────────────────────────────┐
         │                                    │
         ▼                                    ▼
┌──────────────────────┐           ┌──────────────────────┐
│      Video           │           │  Subscription        │
├──────────────────────┤           ├──────────────────────┤
│ id: String (PK)      │           │ id: String (PK)      │
│ title: String        │           │ userId: String (FK)  │
│ description: String  │           │ createdAt: DateTime  │
│ urlStream: String    │           │ updatedAt: DateTime  │
│ thumbnail: String    │           └──────────────────────┘
│ subscribe_count: Int │
│ createdAt: DateTime  │
│ updatedAt: DateTime  │
│ userId: String (FK)  │
└──────────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────────┐
│   WatchHistory       │
├──────────────────────┤
│ id: String (PK)      │
│ userId: String (FK)  │
│ videoId: String (FK) │
│ pausedAt: String     │
│ watchedAt: DateTime  │
│ createdAt: DateTime  │
└──────────────────────┘

┌──────────────────────┐
│     Hashtag          │
├──────────────────────┤
│ id: String (PK)      │
│ name: String         │
│ usageCount: Int      │
│ createdAt: DateTime  │
└──────────────────────┘

┌──────────────────────┐
│  RefreshToken        │
├──────────────────────┤
│ id: String (PK)      │
│ userId: String (FK)  │
│ token: String        │
│ expiresAt: DateTime  │
│ createdAt: DateTime  │
└──────────────────────┘
```

### Models Details

#### **User**

Stores user account information authenticated via Google OAuth.

#### **Video**

Represents individual video content on the platform.

#### **Subscription**

Tracks user subscriptions to other users.

#### **WatchHistory**

Records user video viewing activity.

#### **Hashtag**

Manages video hashtags for categorization and search.

#### **RefreshToken**

Stores refresh tokens for token rotation.

---

## 🔌 API Documentation

### GraphQL Endpoint

**Path**: `/graphql`  
**Method**: POST  
**Content-Type**: application/json

#### Authentication Queries

##### **me** - Get Current User

Returns the authenticated user's ID.

**Requirements**: ✅ JWT Authentication Guard

---

#### Authentication Mutations

##### **signIn** - Google OAuth Sign In

Authenticate user with Google token and establish session.

```graphql
mutation SignIn($ClientToken: String!) {
  signIn(ClientToken: $ClientToken): AuthPayload!
}
```

**Process**:

1. Validates Google token with Google Auth Library
2. Extracts user email from token
3. Creates/updates user in database
4. Generates JWT access token
5. Creates refresh token and stores in Redis
6. Sets HTTP-only signed cookies (SSID, FTK)

---

##### **rotateToken** - Refresh Access Token

Generate new access token using valid refresh token.

**Requirements**: ✅ JWT Authentication Guard

**Process**:

1. Validates refresh token from cookies
2. Verifies token matches Redis session
3. Generates new access token

---

##### **refresh** - Silent Token Refresh

Refresh token without requiring JWT authentication.

**Process**:

1. Extracts refresh token from cookies
2. Validates against Redis session
3. Returns new access token

---

##### **signOut** - Invalidate Session

End user session and clear authentication.

**Requirements**: ✅ JWT Authentication Guard

**Process**:

1. Validates session exists
2. Deletes session from Redis
3. Clears HTTP-only cookies (SSID and FTK)

---

### REST Endpoints

#### **GET** `/` - Health Check

Returns a simple "Hello" message to verify server is running.

```bash
curl http://localhost:8080/
```

---

## 🔐 Authentication

### Authentication Flow Diagram

```
┌─────────────────┐
│  User Browser   │
└────────┬────────┘
         │
         │ 1. Click "Sign in with Google"
         ▼
    ┌────────────┐
    │ Google    │
    │ OAuth     │
    └────┬───────┘
         │
         │ 2. Returns Google ID Token
         ▼
┌──────────────────────────────┐
│  Application Backend         │
│                              │
│  signIn(googleToken)         │
│  ├─ Verify token with Google │
│  ├─ Extract user email       │
│  ├─ Create/fetch user        │
│  ├─ Generate JWT access token│
│  ├─ Generate refresh token   │
│  ├─ Store session in Redis   │
│  └─ Set HTTP-only cookies    │
│                              │
└──────────────────────────────┘
         │
         │ 3. Returns JWT + Sets Cookies
         ▼
    ┌─────────────────┐
    │ Browser Storage │
    │ JWT: localStorage│
    │ SSID: cookie    │
    │ FTK: cookie     │
    └─────────────────┘
         │
         │ 4. Include JWT in requests
         ▼
    ┌──────────────────┐
    │ API Requests     │
    │ Authorization:   │
    │ Bearer {JWT}     │
    └──────────────────┘
```

### Security Features

- ✅ **Google OAuth 2.0** - Verified token from Google Auth Library
- ✅ **JWT Authentication** - Industry-standard token-based auth
- ✅ **HTTP-Only Cookies** - Prevents XSS attacks
- ✅ **Signed Cookies** - Prevents cookie tampering
- ✅ **Secure HTTPS** - Transport layer security
- ✅ **SameSite=Strict** - CSRF protection
- ✅ **Bcrypt Hashing** - Secure token storage (10 rounds)
- ✅ **Timing-Safe Comparison** - Prevents timing attacks
- ✅ **Token Rotation** - Automatic refresh token rotation
- ✅ **Session Validation** - Redis session verification

---

## 💾 Installation

### Prerequisites

- **Node.js** v20+
- **npm** v11+
- **PostgreSQL** v14+
- **Redis** v7+
- **Git**

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd VideoPlatform/Server
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Environment Variables

```bash
# Copy example file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Step 4: Set Up Database

```bash
# Create PostgreSQL database
createdb video_platform

# Run migrations
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate
```

### Step 5: Verify Installation

```bash
# Build the project
npm run build

# Run tests (if available)
npm run test
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with these variables:

```bash
SERVER_PORT=8080
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/video_platform
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
ACCESS_TOKEN_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
COOKIE_SECRET=your_long_random_cookie_secret_change_this
CLIENT_URL=http://localhost:5173
SSL_KEY_PATH=
SSL_CERT_PATH=
```

### Getting Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable Google+ API
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Choose "Web application"
6. Copy the Client ID to `GOOGLE_CLIENT_ID` in `.env`

---

## 🚀 Running the Application

### Development Mode

```bash
npm run start:dev
```

Server starts at: `http://localhost:8080`

GraphQL Playground: `http://localhost:8080/graphql`

### Production Mode

```bash
npm run build
npm run start:prod
```

### Other Commands

```bash
npm run lint              # Code linting and auto-fix
npm run format            # Code formatting
npm run test              # Run tests
npm run test:cov          # Test with coverage
npm run test:e2e          # E2E tests
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate    # Run migrations
```

---

## ✨ Features

### Implemented ✅

- [x] Google OAuth 2.0 authentication
- [x] JWT token-based authorization
- [x] Session management with Redis
- [x] Refresh token rotation
- [x] Secure token hashing (bcrypt)
- [x] GraphQL API
- [x] Global error handling
- [x] Input validation
- [x] Type-safe ORM (Prisma)
- [x] Modular architecture

### In Progress 🔄

- [ ] Video upload and management
- [ ] Video streaming
- [ ] Search and filtering
- [ ] User subscriptions system
- [ ] Watch history tracking
- [ ] Pagination
- [ ] Rate limiting

### Planned 📋

- [ ] Comments and reactions
- [ ] Recommendations engine
- [ ] Live streaming
- [ ] Notification system
- [ ] Analytics dashboard
- [ ] Admin panel
- [ ] Content moderation

---

## 👨‍💻 Development Guide

### Adding a New Feature

1. **Create Module**

   ```bash
   nest g module features/video
   ```

2. **Create Service**

   ```bash
   nest g service features/video
   ```

3. **Create Resolver**

   ```bash
   nest g resolver features/video
   ```

4. **Define GraphQL Types**

   ```typescript
   @ObjectType()
   export class Video {
     @Field(() => ID)
     id: string;
   }
   ```

5. **Add Routes/Mutations**
   ```typescript
   @Mutation(() => Video)
   async createVideo(@Args('input') input: CreateVideoInput): Promise<Video> {
     return this.videoService.create(input);
   }
   ```

### Testing

```bash
npm run test              # Run all tests
npm run test:watch       # Run in watch mode
npm run test:cov         # With coverage report
```

### Code Style

```bash
npm run lint              # Check for style issues
npm run format            # Auto-format code
```

---

## 🐳 Deployment

### Docker Deployment

```bash
# Start all services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

### Production Build

```bash
npm run build
npm run start:prod
```

---

## 🆘 Troubleshooting

### PostgreSQL Connection Error

```bash
# Check PostgreSQL is running
psql -U postgres -h localhost

# Or start PostgreSQL service
sudo systemctl start postgresql
```

### Redis Connection Error

```bash
# Start Redis
redis-server

# Or check Redis is running
redis-cli ping
```

### Port Already in Use

```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or use different port
SERVER_PORT=3000 npm run start
```

### Environment Variables Not Loading

```bash
# Check .env file exists
ls -la .env

# Verify variables are set
echo $DATABASE_URL
```

---

## 📚 Additional Resources

### Official Documentation

- [NestJS Docs](https://docs.nestjs.com)
- [GraphQL Docs](https://graphql.org)
- [Prisma Docs](https://www.prisma.io/docs)
- [Google OAuth Docs](https://developers.google.com/identity/protocols/oauth2)

### Tools

- [GraphQL Playground](https://www.apollographql.com/docs/apollo-server/testing/graphql-playground)
- [Postman](https://www.postman.com) - API testing
- [pgAdmin](https://www.pgadmin.org) - PostgreSQL management
- [Redis Desktop Manager](https://redisdesktop.com) - Redis GUI

---

## 📝 License

This project is part of the Video Streaming Platform series.

---

## 📊 Project Status

**Current Version**: 1.0.0-alpha  
**Last Updated**: March 29, 2026  
**Stability**: Production-ready (Authentication)  
**Test Coverage**: 0% (To be implemented)

---

## 🎯 Quick Reference

### Key Ports

- **Server**: 8080
- **PostgreSQL**: 5432
- **Redis**: 6379

### Key Files

- **Config**: `src/config/env.validation.ts`
- **Auth**: `src/auth/auth.service.ts`
- **Database**: `prisma/schema.prisma`

### Key Commands

```bash
npm run start:dev       # Development
npm run build          # Build
npm run lint          # Lint
npm run test          # Tests
npm run prisma:migrate # Database
```

---

**Made with ❤️ by the Video Streaming Platform Team**
