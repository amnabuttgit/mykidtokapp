// Enhanced server.js with user details and transaction logging

// Load environment variables from .env file into process.env
require('dotenv').config();

// Import Express.js framework for creating web server
const express = require('express');

// Import Cloudinary SDK v2 for cloud-based media management
const cloudinary = require('cloudinary').v2;

// Import CORS middleware to handle Cross-Origin Resource Sharing
const cors = require('cors');

// Import Stripe SDK and initialize with secret key from environment variables
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create Express application instance
const app = express();

// Set server port from environment variable or default to 3001
const port = process.env.PORT || 3001;

// --- Cloudinary Configuration ---
// Check if all required Cloudinary environment variables exist
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    // Log critical error message to console
    console.error("CRITICAL ERROR: Cloudinary environment variables missing. Please check your .env file.");
    // Exit the process with error code 1
    process.exit(1);
}

// Configure Cloudinary with credentials from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,    // Cloudinary cloud name
    api_key: process.env.CLOUDINARY_API_KEY,          // Cloudinary API key
    api_secret: process.env.CLOUDINARY_API_SECRET,    // Cloudinary API secret
    secure: true                                       // Use HTTPS for all requests
});

// Log successful Cloudinary configuration with cloud name
console.log(`Cloudinary configured for cloud: ${cloudinary.config().cloud_name}`);

// --- Stripe Configuration Check ---
// Verify that Stripe secret key exists in environment variables
if (!process.env.STRIPE_SECRET_KEY) {
    // Log critical error and exit if Stripe key is missing
    console.error("CRITICAL ERROR: STRIPE_SECRET_KEY environment variable missing. Please check your .env file.");
    process.exit(1);
}
// Log successful Stripe configuration
console.log('Stripe configured successfully');

// --- Middleware ---
// Enable CORS for all routes (allows cross-origin requests)
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json());

// --- In-Memory Storage for Demo (Replace with Database in Production) ---
// Create Map to store transaction data using payment_intent_id as key
const transactions = new Map(); // Store transactions by payment_intent_id

// Create Map to store user data using user_id as key
const users = new Map(); // Store user data by user_id

// --- Enhanced Payment Endpoint ---
// POST route handler for creating payment intents
app.post('/api/create-payment', async (req, res) => {
    // Log timestamp and route access
    console.log(`[${new Date().toISOString()}] Received request for /api/create-payment`);
    
    try {
        // Destructure user information from request body with default values
        const {
            userEmail,                                    // User's email address
            userName,                                     // User's display name
            userId,                                       // Unique user identifier
            deviceInfo,                                   // Device information (optional)
            appVersion,                                   // App version (optional)
            purchaseType = 'unlimited_video_selection'   // Purchase type with default value
        } = req.body;

        // Validate that all required user fields are present
        if (!userEmail || !userName || !userId) {
            // Return 400 Bad Request with error message
            return res.status(400).json({
                error: 'Missing required user information: userEmail, userName, and userId are required'
            });
        }

        // Define regular expression for email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        // Test email format against regex pattern
        if (!emailRegex.test(userEmail)) {
            // Return 400 Bad Request for invalid email format
            return res.status(400).json({
                error: 'Invalid email format'
            });
        }

        // Set payment amount in cents ($9.99 = 999 cents)
        const amount = 999; // $9.99 in cents
        
        // Set payment currency
        const currency = 'usd';

        // Log payment creation details
        console.log(`Creating payment intent for user: ${userName} (${userEmail}) - $${amount/100}`);

        // Create Stripe payment intent with enhanced metadata
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,                               // Payment amount in smallest currency unit
            currency: currency,                           // Payment currency
            automatic_payment_methods: {                  // Enable automatic payment method selection
                enabled: true,
            },
            metadata: {                                   // Custom metadata for tracking
                user_id: userId,                          // Store user ID
                user_name: userName,                      // Store user name
                user_email: userEmail,                    // Store user email
                purchase_type: purchaseType,              // Store purchase type
                app_name: 'Kid Tok Premium',              // App name identifier
                app_version: appVersion || 'unknown',     // App version or default
                device_info: deviceInfo || 'unknown',     // Device info or default
                purchase_timestamp: new Date().toISOString(), // Current timestamp
                amount_usd: (amount / 100).toString()     // Amount in dollars as string
            },
            receipt_email: userEmail,                     // Email for payment receipt
            description: `Kid Tok Premium - Unlimited Video Access for ${userName}`, // Payment description
        });

        // Create transaction data object for in-memory storage
        const transactionData = {
            paymentIntentId: paymentIntent.id,            // Stripe payment intent ID
            userId: userId,                               // User identifier
            userName: userName,                           // User display name
            userEmail: userEmail,                         // User email address
            amount: amount,                               // Payment amount
            currency: currency,                           // Payment currency
            status: 'pending',                            // Initial status
            createdAt: new Date().toISOString(),          // Creation timestamp
            deviceInfo: deviceInfo,                       // Device information
            appVersion: appVersion,                       // App version
            purchaseType: purchaseType                    // Type of purchase
        };

        // Store transaction data in Map using payment intent ID as key
        transactions.set(paymentIntent.id, transactionData);

        // Check if user already exists in users Map
        if (users.has(userId)) {
            // Get existing user data
            const existingUser = users.get(userId);
            // Update last purchase attempt timestamp
            existingUser.lastPurchaseAttempt = new Date().toISOString();
            // Increment total attempts counter (with fallback to 0)
            existingUser.totalAttempts = (existingUser.totalAttempts || 0) + 1;
        } else {
            // Create new user record if user doesn't exist
            users.set(userId, {
                userId: userId,                           // User identifier
                userName: userName,                       // User display name
                userEmail: userEmail,                     // User email
                firstSeen: new Date().toISOString(),      // First time user was seen
                lastPurchaseAttempt: new Date().toISOString(), // Last purchase attempt
                totalAttempts: 1,                         // Initialize attempt counter
                successfulPurchases: 0,                   // Initialize successful purchases
                totalSpent: 0                            // Initialize total amount spent
            });
        }

        // Log successful payment intent creation
        console.log(`Payment Intent created successfully: ${paymentIntent.id}`);
        console.log(`Transaction stored for user: ${userName} (${userId})`);
        
        // Send enhanced response with payment details
        res.json({
            clientSecret: paymentIntent.client_secret,    // Client secret for frontend
            paymentIntentId: paymentIntent.id,            // Payment intent ID
            amount: amount,                               // Payment amount
            currency: currency,                           // Payment currency
            userDetails: {                                // User information object
                userId: userId,                           // User ID
                userName: userName,                       // User name
                userEmail: userEmail                      // User email
            },
            transactionDetails: {                         // Transaction details object
                description: paymentIntent.description,   // Payment description
                receiptEmail: userEmail,                  // Receipt email
                timestamp: new Date().toISOString()       // Current timestamp
            }
        });

    } catch (error) {
        // Log error with timestamp
        console.error(`[${new Date().toISOString()}] Error creating payment intent:`, error.message);
        
        // Return error response with status 400
        res.status(400).json({ 
            error: error.message,                         // Error message
            type: error.type || 'payment_creation_error' // Error type with fallback
        });
    }
});

// --- Payment Success Webhook/Confirmation Endpoint ---
// POST route handler for confirming payment completion
app.post('/api/confirm-payment', async (req, res) => {
    // Log payment confirmation request
    console.log(`[${new Date().toISOString()}] Received payment confirmation`);
    
    try {
        // Extract payment intent ID and user ID from request body
        const { paymentIntentId, userId } = req.body;

        // Validate required parameters
        if (!paymentIntentId || !userId) {
            // Return error if required parameters are missing
            return res.status(400).json({
                error: 'Missing paymentIntentId or userId'
            });
        }

        // Retrieve payment intent from Stripe to verify status
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        // Check if payment was successful
        if (paymentIntent.status === 'succeeded') {
            // Check if transaction exists in our records
            if (transactions.has(paymentIntentId)) {
                // Get transaction data from Map
                const transaction = transactions.get(paymentIntentId);
                // Update transaction status to completed
                transaction.status = 'completed';
                // Add completion timestamp
                transaction.completedAt = new Date().toISOString();
                // Save updated transaction back to Map
                transactions.set(paymentIntentId, transaction);
            }

            // Check if user exists in our records
            if (users.has(userId)) {
                // Get user data from Map
                const user = users.get(userId);
                // Increment successful purchases counter
                user.successfulPurchases += 1;
                // Add payment amount to total spent
                user.totalSpent += paymentIntent.amount;
                // Update last successful purchase timestamp
                user.lastSuccessfulPurchase = new Date().toISOString();
                // Mark user as premium
                user.isPremium = true;
                // Save updated user data back to Map
                users.set(userId, user);
            }

            // Log successful payment confirmation
            console.log(`Payment confirmed for user ${userId}: ${paymentIntentId}`);
            
            // Return success response
            res.json({
                success: true,                            // Success flag
                message: 'Payment confirmed successfully', // Success message
                paymentDetails: {                         // Payment details object
                    paymentIntentId: paymentIntentId,     // Payment intent ID
                    amount: paymentIntent.amount,         // Payment amount
                    status: paymentIntent.status          // Payment status
                }
            });
        } else {
            // Log unsuccessful payment status
            console.log(`Payment not successful: ${paymentIntent.status}`);
            
            // Return error for unsuccessful payment
            res.status(400).json({
                error: 'Payment not completed',           // Error message
                status: paymentIntent.status              // Current payment status
            });
        }

    } catch (error) {
        // Log error with timestamp
        console.error(`[${new Date().toISOString()}] Error confirming payment:`, error.message);
        
        // Return server error response
        res.status(500).json({
            error: error.message,                         // Error message
            type: 'payment_confirmation_error'            // Error type
        });
    }
});

// --- Get User Details Endpoint ---
// GET route handler for retrieving user information and transaction history
app.get('/api/user/:userId', (req, res) => {
    // Extract user ID from URL parameters
    const { userId } = req.params;
    
    // Check if user exists in our records
    if (!users.has(userId)) {
        // Return 404 Not Found if user doesn't exist
        return res.status(404).json({
            error: 'User not found'
        });
    }

    // Get user data from Map
    const userData = users.get(userId);
    
    // Filter and sort user's transactions by creation date (newest first)
    const userTransactions = Array.from(transactions.values())  // Convert Map values to array
        .filter(t => t.userId === userId)                       // Filter transactions for this user
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by date descending

    // Return user data with transaction history and summary
    res.json({
        user: userData,                                   // User information
        transactions: userTransactions,                   // User's transaction history
        summary: {                                        // Summary statistics
            totalTransactions: userTransactions.length,  // Total number of transactions
            successfulTransactions: userTransactions.filter(t => t.status === 'completed').length, // Successful transactions count
            totalSpent: userData.totalSpent,              // Total amount spent
            isPremium: userData.isPremium || false        // Premium status with fallback
        }
    });
});

// --- Get All Transactions (Admin Endpoint) ---
// GET route handler for admin dashboard showing all transactions
app.get('/api/admin/transactions', (req, res) => {
    // Get all transactions and sort by creation date (newest first)
    const allTransactions = Array.from(transactions.values())   // Convert Map values to array
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by date descending

    // Calculate summary statistics
    const summary = {
        totalTransactions: allTransactions.length,               // Total transaction count
        completedTransactions: allTransactions.filter(t => t.status === 'completed').length, // Completed transactions
        pendingTransactions: allTransactions.filter(t => t.status === 'pending').length,     // Pending transactions
        totalRevenue: allTransactions                            // Calculate total revenue
            .filter(t => t.status === 'completed')              // Only completed transactions
            .reduce((sum, t) => sum + t.amount, 0),              // Sum all amounts
        uniqueUsers: new Set(allTransactions.map(t => t.userId)).size // Count unique users
    };

    // Return all transactions with summary
    res.json({
        transactions: allTransactions,                           // All transaction data
        summary: summary                                         // Summary statistics
    });
});

// --- Your existing endpoints remain the same ---
// GET route handler for fetching videos from Cloudinary
app.get('/api/videos', async (req, res) => {
    // ... your existing videos endpoint code
    
    // Record start time for performance measurement
    const startTime = Date.now();
    
    // Log request timestamp
    console.log(`[${new Date().toISOString()}] Received request for /api/videos`);
    
    try {
        // Log attempt to fetch videos
        console.log("Attempting to fetch videos using Cloudinary Search API...");
        
        // Execute Cloudinary search for video resources
        const result = await cloudinary.search
            .expression('resource_type:video')                   // Search for video resources only
            .sort_by('created_at', 'desc')                       // Sort by creation date descending
            .max_results(50)                                     // Limit results to 50 items
            .execute();                                          // Execute the search

        // Calculate search duration
        const durationMsSearch = Date.now() - startTime;
        
        // Log search completion and results count
        console.log(`Cloudinary search completed in ${durationMsSearch}ms. Found ${result.resources?.length || 0} video resources.`);

        // Transform Cloudinary resources into frontend-friendly format
        const videos = result.resources.map((resource) => {
            // Generate thumbnail URL using Cloudinary transformations
            const thumbnailUrl = cloudinary.url(resource.public_id, {
                resource_type: 'video',                          // Specify video resource type
                transformation: [
                    { width: 300, height: 169, crop: 'fill', gravity: 'auto' }, // Resize and crop thumbnail
                    { fetch_format: 'jpg', quality: 'auto:good' } // Convert to JPG with auto quality
                ]
            });

            // Initialize formatted duration
            let formattedDuration = 'N/A';
            
            // Format duration if available
            if (resource.duration) {
                // Calculate minutes from duration in seconds
                const minutes = Math.floor(resource.duration / 60);
                // Calculate remaining seconds
                const seconds = Math.floor(resource.duration % 60);
                // Format as MM:SS with zero padding
                formattedDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            }

            // Return formatted video object
            return {
                id: resource.public_id,                          // Cloudinary public ID
                url: resource.secure_url,                        // HTTPS video URL
                thumbnailUrl: thumbnailUrl,                      // Generated thumbnail URL
                filename: resource.filename || resource.public_id.split('/').pop() || 'Video', // Filename with fallbacks
                duration: resource.duration || null,             // Duration in seconds
                formattedDuration: formattedDuration,            // Human-readable duration
                width: resource.width || null,                   // Video width
                height: resource.height || null,                 // Video height
                format: resource.format,                         // Video format
                created_at: resource.created_at                  // Creation timestamp
            };
        });

        // Calculate total processing time
        const endTime = Date.now();
        const durationMsTotal = endTime - startTime;
        
        // Log successful processing
        console.log(`Successfully processed ${videos.length} videos for response in ${durationMsTotal}ms total.`);

        // Return successful response with videos array
        res.status(200).json({ videos: videos });

    } catch (error) {
        // Calculate error processing time
        const endTime = Date.now();
        const durationMs = endTime - startTime;
        
        // Log error with timestamp and duration
        console.error(`[${new Date().toISOString()}] Error in /api/videos after ${durationMs}ms:`, error.error || error);

        // Determine HTTP status code from error
        let statusCode = error.http_code || 500;
        
        // Extract error message with fallback
        let errorMessage = error.error?.message || error.message || "Internal Server Error occurred while fetching videos.";

        // Return error response
        res.status(statusCode).json({
            message: errorMessage,                               // Error message
            error: process.env.NODE_ENV === 'development' ? (error.error || error) : undefined // Include error details only in development
        });
    }
});

// GET route handler for testing Stripe connection
app.get('/api/test-stripe', (req, res) => {
    // Log Stripe connection test
    console.log(`[${new Date().toISOString()}] Testing Stripe connection...`);
    
    // Return test response with server information
    res.json({ 
        message: 'Stripe endpoint is working!',                  // Success message
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,           // Boolean check for Stripe key
        stripeKeyExists: process.env.STRIPE_SECRET_KEY ? 'Yes' : 'No', // Human-readable Stripe key status
        serverTime: new Date().toISOString(),                    // Current server time
        serverIP: '192.168.1.8',                                 // Server IP address
        port: port,                                              // Server port
        // Add transaction summary
        totalTransactions: transactions.size,                    // Total transactions count
        totalUsers: users.size                                   // Total users count
    });
});

// GET route handler for root path (home page)
app.get('/', (req, res) => {
    // Calculate total revenue from completed transactions
    const totalRevenue = Array.from(transactions.values())      // Convert Map to array
        .filter(t => t.status === 'completed')                  // Filter completed transactions
        .reduce((sum, t) => sum + t.amount, 0);                  // Sum all amounts

    // Return HTML response with server status and statistics
    res.status(200).send(`
        <h1>Video Backend Server with Enhanced Payments!</h1>
        <p>Cloudinary configured for: ${cloudinary.config().cloud_name}</p>
        <p>Stripe configured: ${process.env.STRIPE_SECRET_KEY ? 'Yes' : 'No'}</p>
        <p>Server time: ${new Date().toISOString()}</p>
        
        <h3>Payment Statistics:</h3>
        <ul>
            <li>Total Transactions: ${transactions.size}</li>
            <li>Total Users: ${users.size}</li>
            <li>Total Revenue: $${(totalRevenue / 100).toFixed(2)}</li>
        </ul>
        
        <h3>Available endpoints:</h3>
        <ul>
            <li><a href="/api/videos">/api/videos</a> - Get all videos</li>
            <li><a href="/api/test-stripe">/api/test-stripe</a> - Test Stripe connection</li>
            <li>POST /api/create-payment - Create payment intent (enhanced)</li>
            <li>POST /api/confirm-payment - Confirm payment completion</li>
            <li>GET /api/user/:userId - Get user details and transaction history</li>
            <li><a href="/api/admin/transactions">/api/admin/transactions</a> - View all transactions (admin)</li>
        </ul>
    `);
});

// Global error handling middleware
app.use((err, req, res, next) => {
  // Log unhandled errors with timestamp
  console.error(`[${new Date().toISOString()}] Unhandled Error:`, err.stack || err);
  
  // Return generic error response
  res.status(500).json({ 
    message: 'Something broke on the server! Please try again later.', // Generic error message
    error: process.env.NODE_ENV === 'development' ? err.message : undefined // Include error details only in development
  });
});

// Start the server and listen on all network interfaces
app.listen(port,'0.0.0.0', () => {
    // Log server startup information
    console.log(`Server listening on all interfaces at port ${port}`);
    console.log(`Accessible via http://10.11.24.93:${port}`);
    console.log(`Test Stripe: http://10.11.24.93:${port}/api/test-stripe`);
    console.log(`Admin Dashboard: http://10.11.24.93:${port}/api/admin/transactions`);
    console.log('Enhanced payment system with user tracking enabled!');
});