import express from "express"; 
import bodyParser from "body-parser";
import mysql from "mysql2/promise"; // Promise-based MySQL client
import bcrypt from "bcrypt";
import session from 'express-session';

const app = express();
const port = 3000;
const saltRounds = 10;
// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(session({
  secret: 'karthik', // Change this to a more secure key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false}, // Set to true in production with HTTPS
  maxAge: 1000 * 60 * 60 * 24
}));

async function connectDb() {
  try {
    const con = await mysql.createConnection({
      host: "localhost",
      user: "karthik",
      password: "karthik@007",
      database: "agrifarms",
    });
    console.log("Connected to DB");
    return con;
  } catch (err) {
    console.error("Error connecting to DB:", err);
    throw err;
  }
}
connectDb(); 
console.log("Connected to DB successfully");



// Function to register a customer
async function registerCustomer(customerData) {
  const con = await connectDb();
  try {
    const hashedPassword = await bcrypt.hash(customerData.password, saltRounds);
    const [rows] = await con.execute(
      'INSERT INTO customers (name, email, password) VALUES (?, ?, ?)', 
      [customerData.name, customerData.email, hashedPassword]
    );
    console.log('Customer registered successfully:', rows);
    
    return rows.insertId;
  } catch (err) {
    console.error('Error registering customer:', err);
    throw err;
  } finally {
    await con.end();
  }
}
// Authenticate Customer
async function authenticateCustomer(email, password) {
  const con = await connectDb();
  try {
    const [results] = await con.execute(
      "SELECT * FROM customers WHERE email = ?",
      [email]
    );

    if (results.length > 0) {
      const isMatch = await bcrypt.compare(password, results[0].password);
      return isMatch ? results[0] : null; // Return the user if the password matches
    }

    return null; // Return null if no user is found
  } catch (err) {
    console.error("Error authenticating customer:", err);
    throw err;
  } finally {
    con.end(); // Always close the connection
  }
}
// Routes
app.get("/", (req, res) => {
  res.render("customer-signup"); // Render the customer registration page
});

// Customer Signup
app.post("/customer-signup", async (req, res) => {
  const { name, email, password } = req.body;
  const con = await connectDb();

  try {
    // Check if email already exists in the customers table
    const [existingUser] = await con.execute('SELECT * FROM customers WHERE email = ?', [email]);

    if (existingUser.length > 0) {
      // Email already registered, redirect to Sign-In with a message
      res.render("customer-signup", { errorMessage: "Account already exists. Please sign in." });
    } else {
      // Register the new customer
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const [rows] = await con.execute(
        'INSERT INTO customers (name, email, password) VALUES (?, ?, ?)', 
        [name, email, hashedPassword]
      );
      
      console.log("Customer registered successfully:", rows);
      res.redirect("/products");
    }
  } catch (err) {
    console.error("Error during signup:", err.message);
    res.status(500).send("An error occurred during signup.");
  } finally {
    await con.end();
  }
});

// Customer Sign-In Page
app.get("/customer-signin", (req, res) => {
  res.render("customer-signin");
});

// Customer Sign-In
app.post("/customer-signin", async (req, res) => {
  const { email, password } = req.body;
  const customer = await authenticateCustomer(email, password);
  if (customer) {
    res.redirect("/products");
  } else {
    res.status(401).send("Invalid email or password.");
  }
});

app.get("/products", async (req, res) => {
  const con = await connectDb();
  try {
    const query = `
      SELECT products.*, farmers.name AS farmer_name 
      FROM products 
      JOIN farmers ON products.farmer_id = farmers.id`;
    const [results] = await con.execute(query);
    res.render("products", { products: results });
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).send("An error occurred while fetching products.");
  } finally {
    await con.end();
  }
});

// Farmers Page
app.get("/farmers", async (req, res) => {
  const con = await connectDb();
  try {
    // Fetch all farmers from the database
    const [results] = await con.execute("SELECT * FROM farmers");

    // Pass the farmers to the view
    res.render("farmers", { farmers: results });
  } catch (err) {
    console.error("Error fetching farmers:", err.message);
    res.status(500).send("An error occurred while fetching farmers.");
  } finally {
    await con.end();
  }
});

// Farmer Sign In Page
app.get("/farmer-signin", (req, res) => {
  res.render("farmer-signin");
});

// Farmer Sign In Logic
app.post("/farmer-signin", async (req, res) => {
  const { email } = req.body;
  const con = await connectDb();
  try {
    const [rows] = await con.execute("SELECT * FROM farmers WHERE email = ?", [email]);
    if (rows.length > 0) {
      const farmerId = rows[0].id;
      res.redirect(`/farmer-add-product/${farmerId}`); // Redirect to add product page
    } else {
      res.send("No account found. Please <a href='/farmer-register'>sign up</a>.");
    }
  } catch (err) {
    console.error("Error signing in farmer:", err.message);
    res.status(500).send("An error occurred during sign-in.");
  } finally {
    await con.end();
  }
});

// Farmer Registration Page
app.get("/farmer-register", (req, res) => {
  res.render("farmer-register");
});

// Farmer Registration Logic
app.post("/farmer-register", async (req, res) => {
  const { name, email, address } = req.body;
  const con = await connectDb();
  try {
    await con.execute("INSERT INTO farmers (name, email, address) VALUES (?, ?, ?)", [name, email, address]);
    res.redirect("/farmer-signin");
  } catch (err) {
    console.error("Error registering farmer:", err.message);
    res.status(500).send("An error occurred during registration.");
  } finally {
    await con.end();
  }
});

// Add Product Page
app.get("/farmer-add-product/:farmerId", (req, res) => {
  const farmerId = req.params.farmerId;
  res.render("add-product", { farmerId });
});
;
app.post("/farmer-add-product", async (req, res) => {
  const { farmer_id, name, description, price, stock } = req.body;
  const con = await connectDb();
  try {
    await con.execute("INSERT INTO products (name, description, price, stock, farmer_id) VALUES (?, ?, ?, ?, ?)", 
      [name, description, price, stock, farmer_id]);
    res.redirect("/farmers");
  } catch (err) {
    console.error("Error adding product:", err.message);
    res.status(500).send("An error occurred while adding the product.");
  } finally {
    await con.end();
  }
});

// View Products by Farmer
// Farmer Products Page (Display products of a specific farmer)
app.get("/farmer-products/:farmerId", async (req, res) => {
  const farmerId = req.params.farmerId;  // Get the farmer ID from the URL
  const con = await connectDb(); // Connect to the database
  try {
    // Query to get products based on the farmer_id
    const [products] = await con.execute(
      'SELECT * FROM products WHERE farmer_id = ?',
      [farmerId]
    );

    // Query to get the farmer's details
    const [farmer] = await con.execute(
      'SELECT * FROM farmers WHERE id = ?',
      [farmerId]
    );
    // Render the farmer-products.ejs page with products and farmer details
    res.render('farmer-products', { products: products, farmer: farmer[0] });
  } catch (err) {
    console.error("Error fetching farmer products:", err.message);
    res.status(500).send("An error occurred while fetching farmer's products.");
  } finally {
    await con.end();  // Close the DB connection
  }
});
app.get('/product-search', async (req, res) => {
  const searchQuery = req.query.q; // Get the search query from the request
  const con = await connectDb(); // Connect to the database

  try {
    // Query for products that match the search query
    const [products] = await con.execute(
      'SELECT * FROM products WHERE name LIKE ?',
      [`%${searchQuery}%`]
    );

    if (products.length > 0) {
      // If a matching product is found, redirect to the product box with an anchor
      const productId = products[0].id; // Use the first matching product
      res.redirect(`/products#product-${productId}`);
    } else {
      // If no products are found, fetch all products and render with an error message
      const [allProducts] = await con.execute('SELECT * FROM products');
      res.render('products', { products: allProducts, searchError: `No results found for "${searchQuery}"` });
    }
  } catch (err) {
    console.error('Error during product search:', err.message);
    res.status(500).send('An error occurred while searching for products.');
  } finally {
    await con.end();
  }
});

//wishlist and cart
// Add Product to Wishlist
let connection;
// Function to initialize the connection
async function initializeDB() {
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'karthik', // Replace with your MySQL username
      password: 'karthik@007', // Replace with your MySQL password
      database: 'agrifarms', // Replace with your database name
    });
    console.log('Connected to DB');
  } catch (error) {
    console.error('Error connecting to DB:', error);
  }
}
initializeDB();
app.post('/add-to-wishlist', async (req, res) => {
  const { productId, userId } = req.body;

  if (!productId || !userId) {
    return res.status(400).json({ success: false, message: 'Product ID and User ID are required' });
  }

  try {
    // Fetch product details
    const [product] = await connection.execute(
      'SELECT name, price FROM products WHERE id = ?',
      [productId]
    );

    if (product.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const productName = product[0].name;
    const productPrice = product[0].price;

    // Fetch customer name
    const [customer] = await connection.execute(
      'SELECT name FROM customers WHERE id = ?',
      [userId]
    );

    if (customer.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const customerName = customer[0].name;

    // Insert into wishlist
    const [result] = await connection.execute(
      'INSERT INTO wishlist (user_id, product_id, product_name, customer_name, price) VALUES (?, ?, ?, ?, ?)',
      [userId, productId, productName, customerName, productPrice]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Added to wishlist successfully' });
    } else {
      res.json({ success: false, message: 'Failed to add to wishlist' });
    }
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ success: false, message: 'An error occurred while adding to wishlist' });
  }
});




// Render Wishlist Page
app.get('/wishlist', async (req, res) => {
  const customerId = 1; // Replace with session/user ID
  const con = await connectDb(); // Establish connection

  try {
    const [wishlistItems] = await con.execute(
      `SELECT p.id, p.name, p.description, p.price, p.stock, f.name AS farmer_name
      FROM products p 
      JOIN wishlist w ON p.id = w.product_id 
      LEFT JOIN farmers f ON p.farmer_id = f.id
      WHERE w.user_id = ?`, 
      [customerId]
    );
    res.render('wishlist', { wishlistItems });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).send('Could not fetch wishlist items');
  } finally {
    await con.end(); // Close the connection after use
  }
});

// Add to Wishlist Route
app.post('/wishlist/add', async (req, res) => {
  const { productId, userId } = req.body;

  const con = await connectDb();
  try {
    await con.execute(
      'INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)',
      [userId, productId]
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ success: false, message: 'Failed to add to wishlist' });
  } finally {
    await con.end();
  }
});

// JavaScript Function to Add to Wishlist
async function addToWishlist(productId) {
  const userId = 1; // Replace with logged-in user's ID
  try {
    const response = await fetch('/wishlist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, userId }),
    });
    const data = await response.json();
    if (data.success) {
      alert('Added to wishlist successfully!');
    } else {
      alert('Failed to add to wishlist.');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Something went wrong.');
  }
}
//cart
const db = await mysql.createConnection({
  host: "localhost",     // Your MySQL host (e.g., 'localhost')
  user: "karthik",          // Your MySQL user (e.g., 'root')
  password: "karthik@007",          // Your MySQL password
  database: "agrifarms", // The name of your database
});

// Connect to the database
db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    process.exit(1);  // Exit the application if the database connection fails
  }
  console.log("Connected to the database!");
});

app.get('/cart', (req, res) => {
  const customer_id = req.session.customer_id;

  if (!customer_id) {
    return res.redirect('/customer-signin');
  }

  const query = `
    SELECT c.id, c.product_id, c.product_name, c.price, c.quantity
    FROM cart c
    WHERE c.customer_id = ?;
  `;

  db.query(query, [customer_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to retrieve cart items.');
    }

    // Render the cart page with the retrieved cart items
    res.render('cart', { cartItems: results });
  });
});



// Route to add product to cart (no quantity field)
app.post("/add-to-cart", async (req, res) => {
  const { product_id, customer_id, quantity } = req.body;
  const con = await connectDb();
  try {
    const [existingCart] = await con.execute(
      "SELECT * FROM cart WHERE customer_id = ? AND product_id = ?",
      [customer_id, product_id]
    );
    if (existingCart.length > 0) {
      await con.execute(
        "UPDATE cart SET quantity = quantity + ? WHERE customer_id = ? AND product_id = ?",
        [quantity, customer_id, product_id]
      );
    } else {
      await con.execute(
        "INSERT INTO cart (customer_id, product_id, quantity) VALUES (?, ?, ?)",
        [customer_id, product_id, quantity]
      );
    }
    res.redirect("/cart");  // Redirect to the cart page after adding the item
  } catch (err) {
    console.error("Error adding to cart:", err.message);
    res.status(500).send("An error occurred while adding the product to the cart.");
  } finally {
    await con.end();
  }
});



// Route to move item from wishlist to cart (no quantity field)
app.post("/wishlist_to_cart", (req, res) => {
  const { wishlist_id } = req.body;

  // Fetch wishlist item
  const wishlistQuery = `
    SELECT w.user_id, c.name AS customer_name, w.product_id, p.name AS product_name, p.price
    FROM wishlist w
    JOIN customers c ON w.user_id = c.id
    JOIN products p ON w.product_id = p.id
    WHERE w.id = ?
  `;
  db.query(wishlistQuery, [wishlist_id], (err, result) => {
    if (err) return res.status(500).send("Error fetching wishlist item");

    const item = result[0];

    // Insert into cart with default quantity of 1
    const cartQuery = `
      INSERT INTO cart (customer_id, customer_name, product_id, product_name, price)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.query(
      cartQuery,
      [
        item.customer_id,
        item.customer_name,
        item.product_id,
        item.product_name,
        item.price,
      ],
      (err) => {
        if (err) return res.status(500).send("Error adding product to cart");

        // Remove from wishlist
        const removeQuery = "DELETE FROM wishlist WHERE id = ?";
        db.query(removeQuery, [wishlist_id], (err) => {
          if (err) return res.status(500).send("Error removing from wishlist");
          res.send("Product moved from wishlist to cart successfully!");
        });
      }
    );
  });
});

function isAuthenticated(req, res, next) {
  if (!req.session.customer_id) {
    return res.redirect('/login');  // Redirect if not logged in
  }
  next();
}
// Profile route (accessible only if logged in)
app.get('/profile', isAuthenticated, (req, res) => {
  const customerId = req.session.customer_id;
  const customerName = req.session.customer_name;
  res.send(`Welcome, ${customerName}! Your Customer ID is: ${customerId}`);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});