-- This script seeds the database for the ChainProof project.
-- It is designed to work with the final schema using SERIAL primary keys and PostGIS.

-- For this script to work, you must have the PostGIS extension enabled.
-- Run this command if you haven't already:
-- CREATE EXTENSION IF NOT EXISTS postgis;

BEGIN;

-- 1. Seed the 'units' lookup table
INSERT INTO units (unit_code, description) VALUES
('kg', 'Kilogram'),
('g', 'Gram'),
('lb', 'Pound'),
('oz', 'Ounce'),
('pc', 'Piece'),
('ea', 'Each'),
('cs', 'Case'),
('bx', 'Box'),
('plt', 'Pallet'),
('gal', 'Gallon'),
('L', 'Liter'),
('m', 'Meter'),
('cm', 'Centimeter'),
('in', 'Inch'),
('ft', 'Foot');

-- 2. Seed the 'product_categories' lookup table
INSERT INTO product_categories (name, description) VALUES
('Raw material', 'Farmer produce, not transformed.'),
('Processed', 'Roasted or grounded beans.'),
('Final product', 'Customer-ready product for retail.');

-- 3. Seed the 'actor_categories' lookup table
INSERT INTO actor_categories (name, description) VALUES
('Farmer', 'Raw produce'),
('Transporter', 'Moves produce between facilities'),
('Roaster', 'Transforms raw beans into roasted beans'),
('Retail store', 'Sells end-product to customer');

-- 4. Seed the 'products' table
-- We use subqueries to get the correct category_id from the 'product_categories' table.
-- The shelf_life_hours are converted to an INTERVAL.
INSERT INTO products (name, description, category_id, variety, bag_type, quantity, unit, shelf_life_hours, notes) VALUES
('Green Arabica beans', 'Unroasted beans harvested at 1,600 m altitude', (SELECT id from product_categories WHERE name = 'Raw material'), 'Caturra', 'Jute bag', 60.00, 'kg', '8640 hours', 'Moisture 11.5%'),
('Green Arabica beans', 'Unroasted beans harvested at 1,450 m altitude', (SELECT id from product_categories WHERE name = 'Raw material'), 'Typica', 'Jute bag', 69.00, 'kg', '8640 hours', 'Moisture 11.2%'),
('Roasted Arabica beans', 'Medium roast produced', (SELECT id from product_categories WHERE name = 'Processed'), 'Caturra', 'Vacuum-sealed bag', 10.00, 'kg', '4320 hours', 'Roast 210°C, 12 min'),
('Roasted Arabica beans', 'Light roast produced', (SELECT id from product_categories WHERE name = 'Processed'), 'Typica', 'Vacuum-sealed bag', 5.00, 'kg', '4320 hours', 'Roast 198°C, 10 min'),
('Ground Arabica coffee', 'Medium grind retail pack', (SELECT id from product_categories WHERE name = 'Final product'), 'Caturra', 'Retail pouch (laminated)', 1.00, 'kg', '3240 hours', 'Drip and espresso'),
('Ground Arabica coffee', 'Fine grind retail packs', (SELECT id from product_categories WHERE name = 'Final product'), 'Typica', 'Retail pouch (laminated)', 500.00, 'g', '3240 hours', 'Espresso focused');

-- 5. Seed the 'actors' table
-- We use the category name directly as per the new schema.
-- We use ST_SetSRID and ST_MakePoint to create the PostGIS geometry point. Note the order: (longitude, latitude).
INSERT INTO actors (name, description, category_name, location, is_fairtrade, is_organic, is_rainforest_alliance, is_bird_friendly, is_carbon_neutral, is_direct_trade, sca_grade, notes) VALUES
('Finca La Esperanza', 'Family farm at 1,600 m altitude producing Arabica Caturra', 'Farmer', ST_SetSRID(ST_MakePoint(-75.590011, 1.584227), 4326), TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 83.00, NULL),
('Finca Santa Maria', 'Cooperative-managed farm at 1,450 m growing Arabica Typica', 'Farmer', ST_SetSRID(ST_MakePoint(-77.858577, 2.473899), 4326), FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, 84.00, NULL),
('Andes Freight', 'Cross-border logistics for agricultural exports', 'Transporter', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '8 trucks, 2 reefers'),
('BlueSea Cargo', 'Sea freight consolidator for coffee containers', 'Transporter', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'MSC partner, 20'' reefers'),
('Laval Distribution Center', 'Regional DC handling packaged coffee for QC', 'Transporter', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Serves 30+ retailers'),
('RoastCo Montreal', 'Specialty roaster focused on medium roasts', 'Roaster', NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 84.00, 'Capacity 1,500 kg/week'),
('Nordik Roast', 'Roaster specializing in light profiles', 'Roaster', NULL, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, 85.00, 'Capacity 1,200 kg/week'),
('BeanMart Montreal', 'Retailer on St-Laurent, specialty coffee', 'Retail store', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Fairtrade selection'),
('Café du Quartier', 'Neighborhood café and retail corner', 'Retail store', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Espresso oriented'),
('Buenaventura Port', 'Columbia Nunito Port', 'Transporter', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('Cartagena Port', 'Columbia Cartagena Port', 'Transporter', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- 6. Seed the 'contacts' table
INSERT INTO contacts (name, email, notes) VALUES
('Juan Pérez', 'juanperez@fincaesperanza.co', NULL),
('Ana Ruiz', 'ana.ruiz@fsm.co', NULL),
('Maria Gomez', 'mgomez@andesfreight.co', '8 trucks, 2 reefers'),
('Luis Torres', 'ltorres@bluesea.co', 'MSC partner, 20'' reefers'),
('Alain Dubois', 'adubois@lavaldc.ca', 'Serves 30+ retailers'),
('Marc Tremblay', 'marc@roastco.ca', 'Capacity 1,500 kg/week'),
('Claire Gagnon', 'claire@nordikroast.ca', 'Capacity 1,200 kg/week'),
('Sophie Leduc', 'sleduc@beanmart.ca', 'Fairtrade selection'),
('Etienne Roy', 'etienne@cafequartier.ca', 'Espresso oriented');

-- 7. Seed the 'actor_contacts' join table
-- We use subqueries to get the new integer IDs for actors and contacts based on their names.
INSERT INTO actor_contacts (actor_id, contact_id) VALUES
((SELECT id from actors WHERE name = 'Finca La Esperanza'), (SELECT id from contacts WHERE name = 'Juan Pérez')),
((SELECT id from actors WHERE name = 'Finca Santa Maria'), (SELECT id from contacts WHERE name = 'Ana Ruiz')),
((SELECT id from actors WHERE name = 'Andes Freight'), (SELECT id from contacts WHERE name = 'Maria Gomez')),
((SELECT id from actors WHERE name = 'BlueSea Cargo'), (SELECT id from contacts WHERE name = 'Luis Torres')),
((SELECT id from actors WHERE name = 'Laval Distribution Center'), (SELECT id from contacts WHERE name = 'Alain Dubois')),
((SELECT id from actors WHERE name = 'RoastCo Montreal'), (SELECT id from contacts WHERE name = 'Marc Tremblay')),
((SELECT id from actors WHERE name = 'Nordik Roast'), (SELECT id from contacts WHERE name = 'Claire Gagnon')),
((SELECT id from actors WHERE name = 'BeanMart Montreal'), (SELECT id from contacts WHERE name = 'Sophie Leduc')),
((SELECT id from actors WHERE name = 'Café du Quartier'), (SELECT id from contacts WHERE name = 'Etienne Roy'));

-- 8. Seed the 'actor_products' join table
-- We use subqueries to get the new integer IDs for actors and products.
-- Note: We use both name and description to uniquely identify products where names might be duplicated.
INSERT INTO actor_products (actor_id, product_id) VALUES
((SELECT id FROM actors WHERE name = 'Finca La Esperanza'), (SELECT id FROM products WHERE name = 'Green Arabica beans' AND variety = 'Caturra')),
((SELECT id FROM actors WHERE name = 'Finca Santa Maria'), (SELECT id FROM products WHERE name = 'Green Arabica beans' AND variety = 'Typica')),
((SELECT id FROM actors WHERE name = 'RoastCo Montreal'), (SELECT id FROM products WHERE name = 'Roasted Arabica beans' AND variety = 'Caturra')),
((SELECT id FROM actors WHERE name = 'Nordik Roast'), (SELECT id FROM products WHERE name = 'Roasted Arabica beans' AND variety = 'Typica')),
((SELECT id FROM actors WHERE name = 'Laval Distribution Center'), (SELECT id FROM products WHERE name = 'Ground Arabica coffee' AND variety = 'Caturra')),
((SELECT id FROM actors WHERE name = 'Laval Distribution Center'), (SELECT id FROM products WHERE name = 'Ground Arabica coffee' AND variety = 'Typica')),
((SELECT id FROM actors WHERE name = 'BeanMart Montreal'), (SELECT id FROM products WHERE name = 'Ground Arabica coffee' AND variety = 'Caturra')),
((SELECT id FROM actors WHERE name = 'BeanMart Montreal'), (SELECT id FROM products WHERE name = 'Ground Arabica coffee' AND variety = 'Typica')),
((SELECT id FROM actors WHERE name = 'Café du Quartier'), (SELECT id FROM products WHERE name = 'Ground Arabica coffee' AND variety = 'Caturra')),
((SELECT id FROM actors WHERE name = 'Café du Quartier'), (SELECT id FROM products WHERE name = 'Ground Arabica coffee' AND variety = 'Typica'));

COMMIT;

