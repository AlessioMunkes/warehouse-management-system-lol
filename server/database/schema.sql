-- ─────────────────────────────────────────────────────────────
-- server/database/schema.sql
--
-- Complete database schema for the Ladles of Love WMS.
-- Inferred from all SQL queries in the codebase.
--
-- HOW TO USE:
--   First time setup (creates everything from scratch):
--     psql -U postgres -d warehouse_db -f server/database/schema.sql
--
--   To recreate from scratch (WARNING: deletes all data):
--     psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS warehouse_db;"
--     psql -U postgres -d postgres -c "CREATE DATABASE warehouse_db;"
--     psql -U postgres -d warehouse_db -f server/database/schema.sql
--     psql -U postgres -d warehouse_db -f server/database/seed.sql
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- USERS
-- Staff who can log in to the WMS.
-- Roles: packer | receiver | manager | admin
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL        PRIMARY KEY,
  username      VARCHAR(50)   NOT NULL UNIQUE,
  first_name    VARCHAR(100)  NOT NULL,
  last_name     VARCHAR(100)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          VARCHAR(20)   NOT NULL CHECK (role IN ('packer', 'receiver', 'manager', 'admin')),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- SUPPLIERS
-- Companies that deliver food to the warehouse.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id            SERIAL        PRIMARY KEY,
  name          VARCHAR(200)  NOT NULL UNIQUE,
  contact_email VARCHAR(255),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- DRIVERS
-- Drivers who deliver on behalf of a supplier.
-- Each driver belongs to one supplier.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id             SERIAL        PRIMARY KEY,
  name           VARCHAR(200)  NOT NULL,
  license_number VARCHAR(50)   NOT NULL UNIQUE,
  supplier_id    INTEGER       NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- PRODUCTS
-- Food items that can be ordered and received.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                SERIAL          PRIMARY KEY,
  name              VARCHAR(200)    NOT NULL UNIQUE,
  stock_keeping_unit VARCHAR(50)    NOT NULL UNIQUE,
  weight_kg         NUMERIC(10, 3),
  is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- PURCHASE ORDERS
-- An approved order from a supplier that can be received against.
-- Status: pending | approved | completed
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     SERIAL        PRIMARY KEY,
  supplier_id            INTEGER       NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  created_by             INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  status                 VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'approved', 'completed')),
  expected_delivery_date DATE,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- PURCHASE ORDER ITEMS
-- The individual product lines within a purchase order.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  SERIAL          PRIMARY KEY,
  purchase_order_id   INTEGER         NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id          INTEGER         NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_quantity   INTEGER         NOT NULL CHECK (expected_quantity > 0),
  expected_weight_kg  NUMERIC(10, 3),
  unit_price          NUMERIC(10, 2),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- DELIVERY NOTES
-- Records an actual delivery that arrived at the warehouse.
-- Linked to a purchase order and captured by a receiver.
-- Status: recorded (only status currently used)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_notes (
  id                SERIAL        PRIMARY KEY,
  supplier_id       INTEGER       NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  driver_id         INTEGER       REFERENCES drivers(id) ON DELETE SET NULL,
  received_by       INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  purchase_order_id INTEGER       NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  delivery_date     DATE          NOT NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'recorded'
                                  CHECK (status IN ('recorded')),
  signature         TEXT,         -- base64 encoded PNG of driver signature
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- Added on all foreign keys and columns used in WHERE / ORDER BY.
-- Prevents sequential scans as data grows.
-- ─────────────────────────────────────────────────────────────

-- users
CREATE INDEX IF NOT EXISTS idx_users_username    ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);

-- drivers
CREATE INDEX IF NOT EXISTS idx_drivers_supplier  ON drivers(supplier_id);

-- purchase_orders
CREATE INDEX IF NOT EXISTS idx_po_supplier       ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status         ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_created_by     ON purchase_orders(created_by);

-- purchase_order_items
CREATE INDEX IF NOT EXISTS idx_poi_po            ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product       ON purchase_order_items(product_id);

-- delivery_notes
CREATE INDEX IF NOT EXISTS idx_dn_supplier       ON delivery_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_dn_driver         ON delivery_notes(driver_id);
CREATE INDEX IF NOT EXISTS idx_dn_received_by    ON delivery_notes(received_by);
CREATE INDEX IF NOT EXISTS idx_dn_po             ON delivery_notes(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_dn_delivery_date  ON delivery_notes(delivery_date);
CREATE INDEX IF NOT EXISTS idx_dn_created_at     ON delivery_notes(created_at);