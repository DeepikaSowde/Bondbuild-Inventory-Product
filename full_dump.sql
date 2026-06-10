--
-- PostgreSQL database dump
--



-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: log_stock_movement(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_stock_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.quantity_in_stock != OLD.quantity_in_stock THEN
        INSERT INTO stock_movements (
            inventory_id, item_code, movement_type, quantity_moved,
            stock_before, stock_after, moved_by, reason, movement_date
        ) VALUES (
            NEW.id,
            NEW.item_code,
            CASE WHEN NEW.quantity_in_stock > OLD.quantity_in_stock THEN 'IN' ELSE 'OUT' END,
            ABS(NEW.quantity_in_stock - OLD.quantity_in_stock),
            OLD.quantity_in_stock,
            NEW.quantity_in_stock,
            'system',
            'Inventory update',
            CURRENT_TIMESTAMP
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_stock_movement() OWNER TO postgres;

--
-- Name: update_inventory_stock_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_inventory_stock_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.quantity_in_stock = 0 THEN
        NEW.stock_status := 'OUT_OF_STOCK';
    ELSIF NEW.quantity_in_stock <= NEW.low_stock_threshold THEN
        NEW.stock_status := 'LOW_STOCK';
    ELSE
        NEW.stock_status := 'OK';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_inventory_stock_status() OWNER TO postgres;

--
-- Name: update_inventory_total_value(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_inventory_total_value() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.total_value := NEW.quantity_in_stock * NEW.unit_price;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_inventory_total_value() OWNER TO postgres;

--
-- Name: update_projects_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_projects_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_projects_timestamp() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    item_name character varying(255),
    location_id integer,
    location_code character varying(50),
    profile_id integer,
    profile_name character varying(255),
    size character varying(100),
    length numeric(10,2),
    length_unit character varying(20) DEFAULT 'mm'::character varying,
    quantity_in_stock integer DEFAULT 0,
    unit_of_measurement character varying(20) DEFAULT 'PCS'::character varying,
    unit_price numeric(10,2) DEFAULT 0.00,
    total_value numeric(15,2) DEFAULT 0.00,
    currency character varying(3) DEFAULT 'SGD'::character varying,
    stock_status character varying(50) DEFAULT 'OK'::character varying,
    low_stock_threshold integer DEFAULT 10,
    reorder_quantity integer DEFAULT 50,
    remarks text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.inventory OWNER TO postgres;

--
-- Name: inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_id_seq OWNER TO postgres;

--
-- Name: inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_id_seq OWNED BY public.inventory.id;


--
-- Name: inventory_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_profiles (
    id integer NOT NULL,
    profile_code character varying(50) NOT NULL,
    profile_name character varying(255) NOT NULL,
    profile_type character varying(100),
    description text,
    unit_of_measurement character varying(20) DEFAULT 'PCS'::character varying,
    status character varying(20) DEFAULT 'Active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.inventory_profiles OWNER TO postgres;

--
-- Name: inventory_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_profiles_id_seq OWNER TO postgres;

--
-- Name: inventory_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_profiles_id_seq OWNED BY public.inventory_profiles.id;


--
-- Name: inventory_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.inventory_summary AS
 SELECT count(DISTINCT id) AS total_items,
    sum(quantity_in_stock) AS total_pieces,
    sum(total_value) AS total_value,
    count(DISTINCT
        CASE
            WHEN ((stock_status)::text = 'OK'::text) THEN id
            ELSE NULL::integer
        END) AS ok_items,
    count(DISTINCT
        CASE
            WHEN ((stock_status)::text = 'LOW_STOCK'::text) THEN id
            ELSE NULL::integer
        END) AS low_stock_items,
    count(DISTINCT
        CASE
            WHEN ((stock_status)::text = 'OUT_OF_STOCK'::text) THEN id
            ELSE NULL::integer
        END) AS out_of_stock_items,
    count(DISTINCT location_id) AS location_count,
    count(DISTINCT profile_id) AS profile_count,
    avg(unit_price) AS avg_unit_price,
    CURRENT_TIMESTAMP AS generated_at
   FROM public.inventory i
  WHERE (is_active = true);


ALTER VIEW public.inventory_summary OWNER TO postgres;

--
-- Name: low_stock_items; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.low_stock_items AS
 SELECT id,
    item_code,
    item_name,
    profile_name,
    size,
    location_code,
    quantity_in_stock,
    low_stock_threshold,
    reorder_quantity,
    unit_price,
    total_value
   FROM public.inventory i
  WHERE ((quantity_in_stock <= low_stock_threshold) AND (is_active = true))
  ORDER BY quantity_in_stock;


ALTER VIEW public.low_stock_items OWNER TO postgres;

--
-- Name: out_of_stock_items; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.out_of_stock_items AS
 SELECT id,
    item_code,
    item_name,
    profile_name,
    size,
    location_code,
    reorder_quantity,
    unit_price
   FROM public.inventory i
  WHERE ((quantity_in_stock = 0) AND (is_active = true))
  ORDER BY updated_at DESC;


ALTER VIEW public.out_of_stock_items OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    project_name character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'Upcoming'::character varying NOT NULL,
    contract_sum numeric(15,2) DEFAULT 0 NOT NULL,
    total_received numeric(15,2) DEFAULT 0 NOT NULL,
    balance numeric(15,2) GENERATED ALWAYS AS ((contract_sum - total_received)) STORED,
    site_progress numeric(5,4) DEFAULT 0 NOT NULL,
    claim_till_date numeric(5,4) DEFAULT 0 NOT NULL,
    total_target_pct numeric(5,4) DEFAULT 1.0 NOT NULL,
    total_claimed_pct numeric(5,4) DEFAULT 0 NOT NULL,
    target_monthly jsonb DEFAULT '{}'::jsonb,
    claimed_monthly jsonb DEFAULT '{}'::jsonb,
    received_monthly jsonb DEFAULT '{}'::jsonb,
    risk_level character varying(50) DEFAULT 'low'::character varying,
    risk_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    uploaded_by character varying(255),
    excel_source character varying(255),
    down_payment numeric(15,2) DEFAULT 0 NOT NULL,
    CONSTRAINT claim_range CHECK (((claim_till_date >= (0)::numeric) AND (claim_till_date <= (1)::numeric))),
    CONSTRAINT contract_positive CHECK ((contract_sum >= (0)::numeric)),
    CONSTRAINT progress_range CHECK (((site_progress >= (0)::numeric) AND (site_progress <= (1)::numeric))),
    CONSTRAINT received_positive CHECK ((total_received >= (0)::numeric)),
    CONSTRAINT risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['high'::character varying, 'medium'::character varying, 'low'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT status_check CHECK (((status)::text = ANY ((ARRAY['Closed'::character varying, 'Completed'::character varying, 'In Progress'::character varying, 'Upcoming Project'::character varying])::text[]))),
    CONSTRAINT total_claimed_range CHECK (((total_claimed_pct >= (0)::numeric) AND (total_claimed_pct <= (1)::numeric))),
    CONSTRAINT total_target_range CHECK (((total_target_pct >= (0)::numeric) AND (total_target_pct <= (1)::numeric)))
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_id_seq OWNER TO postgres;

--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: stock_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_alerts (
    id integer NOT NULL,
    inventory_id integer NOT NULL,
    item_code character varying(100),
    alert_type character varying(50),
    alert_status character varying(20) DEFAULT 'Active'::character varying,
    severity character varying(20),
    title character varying(255),
    message text,
    current_quantity integer,
    threshold_quantity integer,
    alert_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    acknowledged_by character varying(100),
    acknowledged_date timestamp without time zone,
    resolved_date timestamp without time zone
);


ALTER TABLE public.stock_alerts OWNER TO postgres;

--
-- Name: stock_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_alerts_id_seq OWNER TO postgres;

--
-- Name: stock_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_alerts_id_seq OWNED BY public.stock_alerts.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_movements (
    id integer NOT NULL,
    inventory_id integer NOT NULL,
    item_code character varying(100),
    movement_type character varying(50) NOT NULL,
    quantity_moved integer NOT NULL,
    movement_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reference_type character varying(50),
    reference_number character varying(100),
    moved_by character varying(100),
    approved_by character varying(100),
    reason text,
    notes text,
    stock_before integer,
    stock_after integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.stock_movements OWNER TO postgres;

--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_movements_id_seq OWNER TO postgres;

--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: stock_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_permissions (
    id integer NOT NULL,
    role character varying(50) NOT NULL,
    view_stock boolean DEFAULT true,
    view_unit_price boolean DEFAULT false,
    view_total_value boolean DEFAULT false,
    edit_quantity boolean DEFAULT false,
    edit_location boolean DEFAULT false,
    add_item boolean DEFAULT false,
    delete_item boolean DEFAULT false,
    export_excel boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.stock_permissions OWNER TO postgres;

--
-- Name: stock_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_permissions_id_seq OWNER TO postgres;

--
-- Name: stock_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_permissions_id_seq OWNED BY public.stock_permissions.id;


--
-- Name: storage_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.storage_locations (
    id integer NOT NULL,
    location_code character varying(50) NOT NULL,
    location_name character varying(255),
    location_type character varying(50),
    capacity integer,
    status character varying(20) DEFAULT 'Active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.storage_locations OWNER TO postgres;

--
-- Name: storage_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.storage_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.storage_locations_id_seq OWNER TO postgres;

--
-- Name: storage_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.storage_locations_id_seq OWNED BY public.storage_locations.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    designation character varying(100),
    status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['Admin'::character varying, 'Drafter'::character varying, 'Purchaser'::character varying, 'Manager'::character varying, 'Supervisor'::character varying, 'Factory In-charge'::character varying, 'QS'::character varying])::text[]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: inventory id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory ALTER COLUMN id SET DEFAULT nextval('public.inventory_id_seq'::regclass);


--
-- Name: inventory_profiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_profiles ALTER COLUMN id SET DEFAULT nextval('public.inventory_profiles_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: stock_alerts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_alerts ALTER COLUMN id SET DEFAULT nextval('public.stock_alerts_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: stock_permissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_permissions ALTER COLUMN id SET DEFAULT nextval('public.stock_permissions_id_seq'::regclass);


--
-- Name: storage_locations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.storage_locations ALTER COLUMN id SET DEFAULT nextval('public.storage_locations_id_seq'::regclass);


--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.inventory VALUES (7, 'LA-007', 'LA-007 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '75x75x2.8mm Thk', 6000.00, 'mm', 3, 'PCS', 20.00, 60.00, 'SGD', 'LOW_STOCK', 10, 50, '2Pcs for 28 chenchery (30/1/2026)', true, '2026-05-31 14:54:58.137196', '2026-05-31 14:54:58.137196');
INSERT INTO public.inventory VALUES (8, 'LA-008', 'LA-008 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '38x75x2.8mm Thk', 6000.00, 'mm', 7, 'PCS', 20.00, 140.00, 'SGD', 'LOW_STOCK', 10, 50, 'All used for JN431-072 (16 TA)', true, '2026-05-31 14:54:58.13834', '2026-05-31 14:54:58.13834');
INSERT INTO public.inventory VALUES (9, 'LA-009', 'LA-009 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '50x75x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '2Pcs for 28 chenchery (30/1/2026)', true, '2026-05-31 14:54:58.139547', '2026-05-31 14:54:58.139547');
INSERT INTO public.inventory VALUES (10, 'LA-010', 'LA-010 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '25x75x2.8mm Thk', 6000.00, 'mm', 3, 'PCS', 20.00, 60.00, 'SGD', 'LOW_STOCK', 10, 50, '1Pcs for 16 third ave* (30/1/2026)', true, '2026-05-31 14:54:58.141715', '2026-05-31 14:54:58.141715');
INSERT INTO public.inventory VALUES (11, 'LA-011', 'LA-011 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '25x25x2.8mm Thk', 6000.00, 'mm', 7, 'PCS', 20.00, 140.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.142914', '2026-05-31 14:54:58.142914');
INSERT INTO public.inventory VALUES (12, 'FB-001', 'FB-001 Flat Bar', 2, 'Pallet-02', NULL, 'Flat Bar', '100x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.144019', '2026-05-31 14:54:58.144019');
INSERT INTO public.inventory VALUES (13, 'FB-002', 'FB-002 Flat Bar', 2, 'Pallet-02', NULL, 'Flat Bar', '38x2.8mm Thk', 6000.00, 'mm', 8, 'PCS', 20.00, 160.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.1452', '2026-05-31 14:54:58.1452');
INSERT INTO public.inventory VALUES (14, 'LA-012', 'LA-012 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '38x38x2.8mm Thk', 5400.00, 'mm', 95, 'PCS', 20.00, 1900.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.146675', '2026-05-31 14:54:58.146675');
INSERT INTO public.inventory VALUES (15, 'LA-013', 'LA-013 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '19x19x2.8mm Thk', 6000.00, 'mm', 12, 'PCS', 20.00, 240.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.14842', '2026-05-31 14:54:58.14842');
INSERT INTO public.inventory VALUES (16, 'RHS-001', 'RHS-001 Rectangular Hollow', 2, 'Pallet-02', NULL, 'Rectangular Hollow', '38x100x2.8mm Thk', 6000.00, 'mm', 6, 'PCS', 20.00, 120.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.149699', '2026-05-31 14:54:58.149699');
INSERT INTO public.inventory VALUES (17, 'SHS-001', 'SHS-001 Square Hollow', 2, 'Pallet-02', NULL, 'Square Hollow', '50x50x2.8mm Thk', 6000.00, 'mm', 6, 'PCS', 20.00, 120.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.151185', '2026-05-31 14:54:58.151185');
INSERT INTO public.inventory VALUES (18, 'RHS-002', 'RHS-002 Rectangular Hollow', 2, 'Pallet-02', NULL, 'Rectangular Hollow', '44x75x2mm Thk', 6000.00, 'mm', 12, 'PCS', 20.00, 240.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.152985', '2026-05-31 14:54:58.152985');
INSERT INTO public.inventory VALUES (19, 'LA-014', 'LA-014 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '75x150x6mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.154483', '2026-05-31 14:54:58.154483');
INSERT INTO public.inventory VALUES (20, 'LA-015', 'LA-015 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '44x50x2.8mm Thk', 6000.00, 'mm', 20, 'PCS', 20.00, 400.00, 'SGD', 'OK', 10, 50, 'All used for JN431-070 (16 TA)', true, '2026-05-31 14:54:58.156426', '2026-05-31 14:54:58.156426');
INSERT INTO public.inventory VALUES (21, 'LA-016', 'LA-016 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '50x50x2.8mm Thk', 6000.00, 'mm', 11, 'PCS', 20.00, 220.00, 'SGD', 'OK', 10, 50, '3Pcs for 28 chenchery (30/1/2026)', true, '2026-05-31 14:54:58.159561', '2026-05-31 14:54:58.159561');
INSERT INTO public.inventory VALUES (22, 'LA-017', 'LA-017 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '38x38x2.8mm Thk', 6000.00, 'mm', 10, 'PCS', 20.00, 200.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.161297', '2026-05-31 14:54:58.161297');
INSERT INTO public.inventory VALUES (23, 'LA-018', 'LA-018 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '100x100x2.8mm Thk', 6000.00, 'mm', 10, 'PCS', 20.00, 200.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.162591', '2026-05-31 14:54:58.162591');
INSERT INTO public.inventory VALUES (24, 'LA-019', 'LA-019 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '100x100x4mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.163657', '2026-05-31 14:54:58.163657');
INSERT INTO public.inventory VALUES (25, 'LA-020', 'LA-020 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '75x75x4mm Thk', 6000.00, 'mm', 12, 'PCS', 20.00, 240.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.1647', '2026-05-31 14:54:58.1647');
INSERT INTO public.inventory VALUES (26, 'LA-021', 'LA-021 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '75x75x2.8mm Thk', 6000.00, 'mm', 16, 'PCS', 20.00, 320.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.165836', '2026-05-31 14:54:58.165836');
INSERT INTO public.inventory VALUES (27, 'LA-022', 'LA-022 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '75x50x4mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.166986', '2026-05-31 14:54:58.166986');
INSERT INTO public.inventory VALUES (28, 'LA-023', 'LA-023 L-Angle', 2, 'Pallet-02', 1, 'L-Angle', '50x100x4mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.168027', '2026-05-31 14:54:58.168027');
INSERT INTO public.inventory VALUES (32, 'RHS-003', 'RHS-003 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '100x25x2mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.320681', '2026-05-31 14:54:58.320681');
INSERT INTO public.inventory VALUES (34, 'RHS-004', 'RHS-004 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '200x50x2.8mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.413932', '2026-05-31 14:54:58.413932');
INSERT INTO public.inventory VALUES (35, 'RHS-005', 'RHS-005 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '150x50x2mm Thk', 5400.00, 'mm', 15, 'PCS', 20.00, 300.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.41856', '2026-05-31 14:54:58.41856');
INSERT INTO public.inventory VALUES (36, 'RHS-006', 'RHS-006 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '150x38x2mm Thk', 5400.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.419624', '2026-05-31 14:54:58.419624');
INSERT INTO public.inventory VALUES (37, 'RHS-007', 'RHS-007 Square Hollow', NULL, 'Pallet-03', NULL, 'Square Hollow', '150x150x2mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.420696', '2026-05-31 14:54:58.420696');
INSERT INTO public.inventory VALUES (38, 'RHS-008', 'RHS-008 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '50x100x2.8mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.421549', '2026-05-31 14:54:58.421549');
INSERT INTO public.inventory VALUES (39, 'RHS-009', 'RHS-009 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '44x100x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.422353', '2026-05-31 14:54:58.422353');
INSERT INTO public.inventory VALUES (40, 'RHS-010', 'RHS-010 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '38x100x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.423382', '2026-05-31 14:54:58.423382');
INSERT INTO public.inventory VALUES (41, 'RHS-011', 'RHS-011 Rectangular Hollow', NULL, 'Pallet-03', NULL, 'Rectangular Hollow', '19x38x2.8mm Thk', 6000.00, 'mm', 6, 'PCS', 20.00, 120.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.424383', '2026-05-31 14:54:58.424383');
INSERT INTO public.inventory VALUES (43, 'RHS-012', 'RHS-012 Rectangular Hollow', NULL, 'Pallet-04', NULL, 'Rectangular Hollow', '100x50x2.8mm Thk', 6000.00, 'mm', 17, 'PCS', 20.00, 340.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.470069', '2026-05-31 14:54:58.470069');
INSERT INTO public.inventory VALUES (47, 'RHS-013', 'RHS-013 Rectangular Hollow', NULL, 'Pallet-04', NULL, 'Rectangular Hollow', '100x50x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.604644', '2026-05-31 14:54:58.604644');
INSERT INTO public.inventory VALUES (48, 'RHS-014', 'RHS-014 Rectangular Hollow', NULL, 'Pallet-04', NULL, 'Rectangular Hollow', '100x38x2.8mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.609388', '2026-05-31 14:54:58.609388');
INSERT INTO public.inventory VALUES (49, 'RHS-015', 'RHS-015 Rectangular Hollow', NULL, 'Pallet-04', NULL, 'Rectangular Hollow', '25x75x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.610467', '2026-05-31 14:54:58.610467');
INSERT INTO public.inventory VALUES (51, 'RHS-016', 'RHS-016 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '25x50x2.8mm Thk', 6000.00, 'mm', 61, 'PCS', 20.00, 1220.00, 'SGD', 'OK', 10, 50, '2Pcs for 12 herlin', true, '2026-05-31 14:54:58.654874', '2026-05-31 14:54:58.654874');
INSERT INTO public.inventory VALUES (53, 'RHS-017', 'RHS-017 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '25x38x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '3Pcs for 12 herlin', true, '2026-05-31 14:54:58.710081', '2026-05-31 14:54:58.710081');
INSERT INTO public.inventory VALUES (54, 'RHS-018', 'RHS-018 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '19x38x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.729195', '2026-05-31 14:54:58.729195');
INSERT INTO public.inventory VALUES (55, 'RHS-019', 'RHS-019 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '19x25x2.0mm Thk', 6000.00, 'mm', 14, 'PCS', 20.00, 280.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.73126', '2026-05-31 14:54:58.73126');
INSERT INTO public.inventory VALUES (56, 'RHS-020', 'RHS-020 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '50x200x2.8mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.733157', '2026-05-31 14:54:58.733157');
INSERT INTO public.inventory VALUES (58, 'RHS-021', 'RHS-021 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '50x125x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.7863', '2026-05-31 14:54:58.7863');
INSERT INTO public.inventory VALUES (59, 'RHS-022', 'RHS-022 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '25x100x2.0mm Thk', 6000.00, 'mm', 18, 'PCS', 20.00, 360.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.79085', '2026-05-31 14:54:58.79085');
INSERT INTO public.inventory VALUES (60, 'RHS-023', 'RHS-023 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '25x75x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.792088', '2026-05-31 14:54:58.792088');
INSERT INTO public.inventory VALUES (61, 'RHS-024', 'RHS-024 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '50x100x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.793377', '2026-05-31 14:54:58.793377');
INSERT INTO public.inventory VALUES (62, 'RHS-025', 'RHS-025 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '50x75x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.795338', '2026-05-31 14:54:58.795338');
INSERT INTO public.inventory VALUES (63, 'RHS-026', 'RHS-026 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '38x100x2.0mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.796657', '2026-05-31 14:54:58.796657');
INSERT INTO public.inventory VALUES (64, 'RHS-027', 'RHS-027 Rectangular Hollow', NULL, 'Pallet-07', NULL, 'Rectangular Hollow', '40x100x4.0mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.797912', '2026-05-31 14:54:58.797912');
INSERT INTO public.inventory VALUES (65, 'LA-024', 'LA-024 L-Angle', NULL, 'Pallet-07', 1, 'L-Angle', '19x19x2.0mm Thk', 6000.00, 'mm', 32, 'PCS', 20.00, 640.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:58.799357', '2026-05-31 14:54:58.799357');
INSERT INTO public.inventory VALUES (68, 'LA-025', 'LA-025 L-Angle', NULL, 'Pallet-07', 1, 'L-Angle', '12x12x1.0mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.896976', '2026-05-31 14:54:58.896976');
INSERT INTO public.inventory VALUES (70, 'RYN-0160113', 'RYN-0160113 30013', NULL, 'Pallet-08', NULL, '30013', 'Transom ', 7000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:58.951909', '2026-05-31 14:54:58.951909');
INSERT INTO public.inventory VALUES (72, '341625', '341625 undefined', NULL, 'Pallet-08', NULL, NULL, 'Connection Profile', 7000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.006851', '2026-05-31 14:54:59.006851');
INSERT INTO public.inventory VALUES (73, '160026', '160026 undefined', NULL, 'Pallet-08', NULL, NULL, '130 Sliding Inner', 0.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.011621', '2026-05-31 14:54:59.011621');
INSERT INTO public.inventory VALUES (76, '10113', '10113 undefined', NULL, 'Pallet-08', NULL, NULL, 'Window Inner Profile', 0.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.124245', '2026-05-31 14:54:59.124245');
INSERT INTO public.inventory VALUES (81, '160898', '160898 undefined', NULL, 'Pallet-08', NULL, NULL, 'Door Outer Profile ', 7000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.347548', '2026-05-31 14:54:59.347548');
INSERT INTO public.inventory VALUES (82, 'RYN-0135301', 'RYN-0135301 undefined', NULL, 'Pallet-08', NULL, NULL, 'Sliding Inner Profile ', 7000.00, 'mm', 6, 'PCS', 20.00, 120.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.355149', '2026-05-31 14:54:59.355149');
INSERT INTO public.inventory VALUES (83, '136306', '136306 undefined', NULL, 'Pallet-08', NULL, NULL, 'Sliding Outer Cap', 7000.00, 'mm', 3, 'PCS', 20.00, 60.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.356881', '2026-05-31 14:54:59.356881');
INSERT INTO public.inventory VALUES (84, 'RYN-0135312', 'RYN-0135312 undefined', NULL, 'Pallet-08', NULL, NULL, 'Sliding (T/B) ', 5500.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.358778', '2026-05-31 14:54:59.358778');
INSERT INTO public.inventory VALUES (89, 'RYN-136322', 'RYN-136322 undefined', NULL, 'Pallet-10', NULL, NULL, 'SP68 2 Track Outer(L/R)', 0.00, 'mm', 15, 'PCS', 20.00, 300.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:54:59.571591', '2026-05-31 14:54:59.571591');
INSERT INTO public.inventory VALUES (90, 'RYN-136321', 'RYN-136321 undefined', NULL, 'Pallet-10', NULL, NULL, 'SP68 2 Track Outer(Bottom)', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.576306', '2026-05-31 14:54:59.576306');
INSERT INTO public.inventory VALUES (91, 'RYN-0136312', 'RYN-0136312 undefined', NULL, 'Pallet-10', NULL, NULL, 'SP68 3 Track Outer(L/R)', 0.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.577506', '2026-05-31 14:54:59.577506');
INSERT INTO public.inventory VALUES (92, 'RYN-0136325', 'RYN-0136325 undefined', NULL, 'Pallet-10', NULL, NULL, 'SP68 3 Track Outer(Bottom)', 0.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.578595', '2026-05-31 14:54:59.578595');
INSERT INTO public.inventory VALUES (93, 'RYN-0136303', 'RYN-0136303 undefined', NULL, 'Pallet-10', NULL, NULL, 'SP68 Sliding Inner Side Profile', 0.00, 'mm', 6, 'PCS', 20.00, 120.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.579679', '2026-05-31 14:54:59.579679');
INSERT INTO public.inventory VALUES (101, 'LA-026', 'LA-026 L-Angle', NULL, 'Pallet-10', 1, 'L-Angle', '75x75', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:54:59.924804', '2026-05-31 14:54:59.924804');
INSERT INTO public.inventory VALUES (107, 'RHS-028', 'RHS-028 Rectangular Hollow', NULL, 'Pallet-11', NULL, 'Rectangular Hollow', '38x25x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:00.164458', '2026-05-31 14:55:00.164458');
INSERT INTO public.inventory VALUES (112, 'RYN-4030036', 'RYN-4030036 undefined', NULL, 'Pallet-11', NULL, NULL, 'Fixed Glass Outer Profile ', 0.00, 'mm', 17, 'PCS', 20.00, 340.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:00.35077', '2026-05-31 14:55:00.35077');
INSERT INTO public.inventory VALUES (118, 'RHS-029', 'RHS-029 Rectangular Hollow ', NULL, 'Pallet-11', NULL, 'Rectangular Hollow ', '100x32 ', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:00.576886', '2026-05-31 14:55:00.576886');
INSERT INTO public.inventory VALUES (134, 'RHS-030', 'RHS-030 Rectangular Hollow', NULL, 'Pallet-17', NULL, 'Rectangular Hollow', '50x25x2.8mm Thk', 6000.00, 'mm', 7, 'PCS', 20.00, 140.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.254955', '2026-05-31 14:55:01.254955');
INSERT INTO public.inventory VALUES (135, 'RHS-031', 'RHS-031 Rectangular Hollow', NULL, 'Pallet-17', NULL, 'Rectangular Hollow', '38x25x2.8mm Thk', 6000.00, 'mm', 21, 'PCS', 20.00, 420.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:01.258986', '2026-05-31 14:55:01.258986');
INSERT INTO public.inventory VALUES (142, 'RHS-032', 'RHS-032 Rectangular Hollow', NULL, 'Pallet-22', NULL, 'Rectangular Hollow', '75x38x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.531814', '2026-05-31 14:55:01.531814');
INSERT INTO public.inventory VALUES (143, 'RHS-033', 'RHS-033 Rectangular Hollow', NULL, 'Pallet-22', NULL, 'Rectangular Hollow', '120x120x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.536778', '2026-05-31 14:55:01.536778');
INSERT INTO public.inventory VALUES (145, 'LA-027', 'LA-027 L-Angle', NULL, 'Pallet-22', 1, 'L-Angle', '25x25x1mm Thk', 6000.00, 'mm', 80, 'PCS', 20.00, 1600.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:01.583517', '2026-05-31 14:55:01.583517');
INSERT INTO public.inventory VALUES (146, 'RHS-034', 'RHS-034 Rectangular Hollow', NULL, 'Pallet-22', NULL, 'Rectangular Hollow', '120x38x2.8mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.588527', '2026-05-31 14:55:01.588527');
INSERT INTO public.inventory VALUES (147, 'RHS-035', 'RHS-035 Rectangular Hollow', NULL, 'Pallet-22', NULL, 'Rectangular Hollow', '100x32x2.8mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.58995', '2026-05-31 14:55:01.58995');
INSERT INTO public.inventory VALUES (148, 'RHS-036', 'RHS-036 Rectangular Hollow', NULL, 'Pallet-22', NULL, 'Rectangular Hollow', '100x25x2.8mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.591254', '2026-05-31 14:55:01.591254');
INSERT INTO public.inventory VALUES (151, 'RHS-037', 'RHS-037 Rectangular Hollow', NULL, 'Pallet-22', NULL, 'Rectangular Hollow', '38x25x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.681188', '2026-05-31 14:55:01.681188');
INSERT INTO public.inventory VALUES (152, 'RHS-038', 'RHS-038 Rectangular Hollow', NULL, 'Pallet-22', NULL, 'Rectangular Hollow', '50x25x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.685159', '2026-05-31 14:55:01.685159');
INSERT INTO public.inventory VALUES (156, 'RHS-039', 'RHS-039 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '100x38x2.8mm Thk', 6000.00, 'mm', 9, 'PCS', 20.00, 180.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:01.840346', '2026-05-31 14:55:01.840346');
INSERT INTO public.inventory VALUES (158, 'RHS-040', 'RHS-040 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '150x50x2.00mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.049656', '2026-05-31 14:55:02.049656');
INSERT INTO public.inventory VALUES (159, 'RHS-041', 'RHS-041 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '38x38x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.05548', '2026-05-31 14:55:02.05548');
INSERT INTO public.inventory VALUES (160, 'RHS-042', 'RHS-042 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '75x12x2.0mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.057991', '2026-05-31 14:55:02.057991');
INSERT INTO public.inventory VALUES (161, 'RHS-043', 'RHS-043 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '100x50x2.0mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.059749', '2026-05-31 14:55:02.059749');
INSERT INTO public.inventory VALUES (162, 'RHS-044', 'RHS-044 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '75x50x2.8mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.109139', '2026-05-31 14:55:02.109139');
INSERT INTO public.inventory VALUES (163, 'RHS-045', 'RHS-045 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '75x25x2.8mm Thk', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.112553', '2026-05-31 14:55:02.112553');
INSERT INTO public.inventory VALUES (164, 'RHS-046', 'RHS-046 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '100x25x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.11643', '2026-05-31 14:55:02.11643');
INSERT INTO public.inventory VALUES (165, 'RHS-0447', 'RHS-0447 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '100x38x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.119597', '2026-05-31 14:55:02.119597');
INSERT INTO public.inventory VALUES (167, 'RHS-048', 'RHS-048 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '75x12', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.180071', '2026-05-31 14:55:02.180071');
INSERT INTO public.inventory VALUES (177, 'RHS-049', 'RHS-049 Rectangular Hollow', NULL, 'Pallet-24', NULL, 'Rectangular Hollow', '25x10 ', 4000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.595886', '2026-05-31 14:55:02.595886');
INSERT INTO public.inventory VALUES (178, 'LA-028', 'LA-028 L-Angle', NULL, 'Pallet-24', 1, 'L-Angle', '50x38 L Angle', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.600284', '2026-05-31 14:55:02.600284');
INSERT INTO public.inventory VALUES (179, 'LA-029', 'LA-029 L-Angle', NULL, 'Pallet-24', 1, 'L-Angle', '32x32 L Angle', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.601615', '2026-05-31 14:55:02.601615');
INSERT INTO public.inventory VALUES (183, 'RYN-136325', 'RYN-136325 undefined', NULL, 'Pallet-25', NULL, NULL, 'Sliding Door Outer(Top Side)', 6500.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:02.743774', '2026-05-31 14:55:02.743774');
INSERT INTO public.inventory VALUES (193, 'RHS-050', 'RHS-050 Rectangular Hollow', NULL, 'Pallet-25', NULL, 'Rectangular Hollow', '126x126 ', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:03.144843', '2026-05-31 14:55:03.144843');
INSERT INTO public.inventory VALUES (194, 'RHS-051', 'RHS-051 Rectangular Hollow', NULL, 'Pallet-25', NULL, 'Rectangular Hollow', '100x50 ', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:03.150982', '2026-05-31 14:55:03.150982');
INSERT INTO public.inventory VALUES (195, 'RHS-052', 'RHS-052 Rectangular Hollow', NULL, 'Pallet-25', NULL, 'Rectangular Hollow', '100x45 ', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:03.152282', '2026-05-31 14:55:03.152282');
INSERT INTO public.inventory VALUES (207, 'RYN-4030598', 'RYN-4030598 undefined', NULL, 'Pallet-26', NULL, NULL, 'Swing Door Outer', 7000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:03.663742', '2026-05-31 14:55:03.663742');
INSERT INTO public.inventory VALUES (219, 'RHS-053', 'RHS-053 Rectangular Hollow', NULL, 'Pallet-26', NULL, 'Rectangular Hollow', '150x50x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:04.158484', '2026-05-31 14:55:04.158484');
INSERT INTO public.inventory VALUES (226, 'LA-030', 'LA-030 L-Angle', NULL, 'Pallet-34', 1, 'L-Angle', '12x12x4mm L Angle', 6000.00, 'mm', 3, 'PCS', 20.00, 60.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:04.443955', '2026-05-31 14:55:04.443955');
INSERT INTO public.inventory VALUES (231, 'RHS-054', 'RHS-054 Rectangular Hollow', NULL, 'Pallet-34', NULL, 'Rectangular Hollow', '100x25x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:04.628053', '2026-05-31 14:55:04.628053');
INSERT INTO public.inventory VALUES (232, 'RHS-055', 'RHS-055 Square Hollow', NULL, 'Pallet-34', NULL, 'Square Hollow', '100x100x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:04.632886', '2026-05-31 14:55:04.632886');
INSERT INTO public.inventory VALUES (233, 'RHS-056', 'RHS-056 Rectangular Hollow', NULL, 'Pallet-34', NULL, 'Rectangular Hollow', '100x50x2.8mm Thk', 6000.00, 'mm', 3, 'PCS', 20.00, 60.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:04.634061', '2026-05-31 14:55:04.634061');
INSERT INTO public.inventory VALUES (234, 'RHS-057', 'RHS-057 Rectangular Hollow', NULL, 'Pallet-34', NULL, 'Rectangular Hollow', '100x75x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:04.635404', '2026-05-31 14:55:04.635404');
INSERT INTO public.inventory VALUES (239, 'LA-031', 'LA-031 L-Angle', NULL, 'Pallet-34', 1, 'L-Angle', '25x25x L Angle', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:04.829175', '2026-05-31 14:55:04.829175');
INSERT INTO public.inventory VALUES (245, 'RHS-058', 'RHS-058 Rectangular Hollow', NULL, 'Pallet-34', NULL, 'Rectangular Hollow', '75x25', 5000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:05.058549', '2026-05-31 14:55:05.058549');
INSERT INTO public.inventory VALUES (280, 'RHS-059', 'RHS-059 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '100x30x2.8mm Hollow', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:06.613064', '2026-05-31 14:55:06.613064');
INSERT INTO public.inventory VALUES (282, 'RHS-060', 'RHS-060 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '50x25 ', 6000.00, 'mm', 7, 'PCS', 20.00, 140.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:06.663064', '2026-05-31 14:55:06.663064');
INSERT INTO public.inventory VALUES (283, 'RHS-061', 'RHS-061 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '60x90 Transom', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:06.667223', '2026-05-31 14:55:06.667223');
INSERT INTO public.inventory VALUES (284, 'RHS-062', 'RHS-062 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '25x25 ', 6000.00, 'mm', 12, 'PCS', 20.00, 240.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:06.668596', '2026-05-31 14:55:06.668596');
INSERT INTO public.inventory VALUES (285, 'RHS-063', 'RHS-063 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '38x25 ', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:06.669825', '2026-05-31 14:55:06.669825');
INSERT INTO public.inventory VALUES (286, 'RHS-064', 'RHS-064 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '38x15 ', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:06.670784', '2026-05-31 14:55:06.670784');
INSERT INTO public.inventory VALUES (292, 'RHS-065', 'RHS-065 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '25x20x2.8mm Thk', 6000.00, 'mm', 14, 'PCS', 20.00, 280.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:06.888676', '2026-05-31 14:55:06.888676');
INSERT INTO public.inventory VALUES (293, 'RHS-066', 'RHS-066 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '50x38x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:06.89283', '2026-05-31 14:55:06.89283');
INSERT INTO public.inventory VALUES (303, 'RHS-067', 'RHS-067 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '100x25x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:07.317439', '2026-05-31 14:55:07.317439');
INSERT INTO public.inventory VALUES (305, 'RHS-068', 'RHS-068 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '50x100x2.8mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:07.3643', '2026-05-31 14:55:07.3643');
INSERT INTO public.inventory VALUES (306, 'RHS-069', 'RHS-069 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '75x78x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:07.367815', '2026-05-31 14:55:07.367815');
INSERT INTO public.inventory VALUES (307, 'RHS-070', 'RHS-070 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '100x50x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:07.368592', '2026-05-31 14:55:07.368592');
INSERT INTO public.inventory VALUES (310, 'RHS-071', 'RHS-071 Rectangular Hollow', NULL, 'Pallet-44', NULL, 'Rectangular Hollow', '50x25x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:07.491582', '2026-05-31 14:55:07.491582');
INSERT INTO public.inventory VALUES (323, 'LA-032', 'LA-032 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '25X25X2.8mm Thk', 6000.00, 'mm', 50, 'PCS', 20.00, 1000.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.073108', '2026-05-31 14:55:08.073108');
INSERT INTO public.inventory VALUES (324, 'LA-033', 'LA-033 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '25x50x4mm Thk', 6000.00, 'mm', 20, 'PCS', 20.00, 400.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.077375', '2026-05-31 14:55:08.077375');
INSERT INTO public.inventory VALUES (325, 'LA-034', 'LA-034 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '25x50x1.8mm Thk', 6000.00, 'mm', 35, 'PCS', 20.00, 700.00, 'SGD', 'OK', 10, 50, '5Pcs for 12 HR (31/1/2026) & 30Pcs for 12 HR (02/3/2026)', true, '2026-05-31 14:55:08.078585', '2026-05-31 14:55:08.078585');
INSERT INTO public.inventory VALUES (326, 'LA-035', 'LA-035 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '100x100x1.8mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.079601', '2026-05-31 14:55:08.079601');
INSERT INTO public.inventory VALUES (327, 'LA-036', 'LA-036 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '100x50x1.8mm Thk', 6000.00, 'mm', 40, 'PCS', 20.00, 800.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.08062', '2026-05-31 14:55:08.08062');
INSERT INTO public.inventory VALUES (328, 'LA-037', 'LA-037 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '50x50x1.8mm Thk', 6000.00, 'mm', 6, 'PCS', 20.00, 120.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.081417', '2026-05-31 14:55:08.081417');
INSERT INTO public.inventory VALUES (329, 'LA-038', 'LA-038 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '75x25x1.8mm Thk', 6000.00, 'mm', 18, 'PCS', 20.00, 360.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.082135', '2026-05-31 14:55:08.082135');
INSERT INTO public.inventory VALUES (330, 'LA-039', 'LA-039 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '75x25x2.8mm Thk', 6000.00, 'mm', 15, 'PCS', 20.00, 300.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.082788', '2026-05-31 14:55:08.082788');
INSERT INTO public.inventory VALUES (331, 'LA-040', 'LA-040 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '75x25x1.0mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.083458', '2026-05-31 14:55:08.083458');
INSERT INTO public.inventory VALUES (332, 'LA-041', 'LA-041 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '75x75x2.8mm Thk', 6000.00, 'mm', 8, 'PCS', 20.00, 160.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.084117', '2026-05-31 14:55:08.084117');
INSERT INTO public.inventory VALUES (333, 'LA-042', 'LA-042 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '60x60x2.8mm Thk', 6000.00, 'mm', 25, 'PCS', 20.00, 500.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.084796', '2026-05-31 14:55:08.084796');
INSERT INTO public.inventory VALUES (334, 'LA-043', 'LA-043 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '50x50x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.085477', '2026-05-31 14:55:08.085477');
INSERT INTO public.inventory VALUES (335, 'LA-044', 'LA-044 L-Angle', NULL, 'Pallet-46', 1, 'L-Angle', '25X25X2.8mm Thk', 6000.00, 'mm', 13, 'PCS', 20.00, 260.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.086166', '2026-05-31 14:55:08.086166');
INSERT INTO public.inventory VALUES (338, 'RHS-072', 'RHS-072 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '100x50  ', 6000.00, 'mm', 8, 'PCS', 20.00, 160.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.176762', '2026-05-31 14:55:08.176762');
INSERT INTO public.inventory VALUES (339, 'RHS-073', 'RHS-073 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '100x75  ', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.180884', '2026-05-31 14:55:08.180884');
INSERT INTO public.inventory VALUES (341, 'RHS-074', 'RHS-074 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '150x50  ', 6000.00, 'mm', 7, 'PCS', 20.00, 140.00, 'SGD', 'LOW_STOCK', 10, 50, 'All used for JN431-072 (16 TA)', true, '2026-05-31 14:55:08.225849', '2026-05-31 14:55:08.225849');
INSERT INTO public.inventory VALUES (342, 'RHS-075', 'RHS-075 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '75x25  ', 6000.00, 'mm', 12, 'PCS', 20.00, 240.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.231555', '2026-05-31 14:55:08.231555');
INSERT INTO public.inventory VALUES (345, 'RHS-076', 'RHS-076 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '75x50 ', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.322573', '2026-05-31 14:55:08.322573');
INSERT INTO public.inventory VALUES (346, 'RHS-077', 'RHS-077 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '60x25  ', 6000.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.327088', '2026-05-31 14:55:08.327088');
INSERT INTO public.inventory VALUES (348, 'RHS-078', 'RHS-078 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '120x25  ', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.367384', '2026-05-31 14:55:08.367384');
INSERT INTO public.inventory VALUES (349, 'RHS-079', 'RHS-079 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '100x25  ', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.37121', '2026-05-31 14:55:08.37121');
INSERT INTO public.inventory VALUES (350, 'RHS-080', 'RHS-080 Rectangular Hollow', NULL, 'Pallet-49', NULL, 'Rectangular Hollow', '100x38  ', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.372321', '2026-05-31 14:55:08.372321');
INSERT INTO public.inventory VALUES (358, 'RHS-081', 'RHS-081 Rectangular Hollow', NULL, 'Pallet-50', NULL, 'Rectangular Hollow', '38x75 ', 6000.00, 'mm', 21, 'PCS', 20.00, 420.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.686052', '2026-05-31 14:55:08.686052');
INSERT INTO public.inventory VALUES (359, 'RHS-082', 'RHS-082 Rectangular Hollow', NULL, 'Pallet-51', NULL, 'Rectangular Hollow', '75x12 ', 6000.00, 'mm', 24, 'PCS', 20.00, 480.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:08.691125', '2026-05-31 14:55:08.691125');
INSERT INTO public.inventory VALUES (360, 'RHS-083', 'RHS-083 Rectangular Hollow', NULL, 'Pallet-51', NULL, 'Rectangular Hollow', '100x38 ', 6000.00, 'mm', 3, 'PCS', 20.00, 60.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.692188', '2026-05-31 14:55:08.692188');
INSERT INTO public.inventory VALUES (365, 'LA-045', 'LA-045 L-Angle', NULL, 'Pallet-51', 1, 'L-Angle', '75x15x2.8mm Thk', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.862793', '2026-05-31 14:55:08.862793');
INSERT INTO public.inventory VALUES (368, 'RHS-084', 'RHS-084 Rectangular Hollow', NULL, 'Pallet-51', NULL, 'Rectangular Hollow', '50x38x2.8mm Thk', 6000.00, 'mm', 5, 'PCS', 20.00, 100.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.960432', '2026-05-31 14:55:08.960432');
INSERT INTO public.inventory VALUES (369, 'RHS-085', 'RHS-085 Rectangular Hollow', NULL, 'Pallet-51', NULL, 'Rectangular Hollow', '38x38x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.997409', '2026-05-31 14:55:08.997409');
INSERT INTO public.inventory VALUES (370, 'RHS-086', 'RHS-086 Rectangular Hollow', NULL, 'Pallet-51', NULL, 'Rectangular Hollow', '75x19x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:08.999331', '2026-05-31 14:55:08.999331');
INSERT INTO public.inventory VALUES (372, 'RHS-087', 'RHS-087 Rectangular Hollow', NULL, 'Pallet-51', NULL, 'Rectangular Hollow', '50x25x2.8mm Thk', 6000.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.046834', '2026-05-31 14:55:09.046834');
INSERT INTO public.inventory VALUES (375, 'LA-046', 'LA-046 L-Angle', NULL, 'Pallet-51', 1, 'L-Angle', '25x38 ', 6000.00, 'mm', 50, 'PCS', 20.00, 1000.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:09.139578', '2026-05-31 14:55:09.139578');
INSERT INTO public.inventory VALUES (376, 'LA-047', 'LA-047 L-Angle', NULL, 'Pallet-51', 1, 'L-Angle', '100X25', 6000.00, 'mm', 4, 'PCS', 20.00, 80.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.144192', '2026-05-31 14:55:09.144192');
INSERT INTO public.inventory VALUES (377, 'LA-048', 'LA-048 L-Angle', NULL, 'Pallet-51', 1, 'L-Angle', '25x25 ', 6000.00, 'mm', 25, 'PCS', 20.00, 500.00, 'SGD', 'OK', 10, 50, '', true, '2026-05-31 14:55:09.145421', '2026-05-31 14:55:09.145421');
INSERT INTO public.inventory VALUES (378, 'LA-049', 'LA-049 L-Angle', NULL, 'Pallet-51', 1, 'L-Angle', '50x38 ', 6000.00, 'mm', 10, 'PCS', 20.00, 200.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.146508', '2026-05-31 14:55:09.146508');
INSERT INTO public.inventory VALUES (379, 'LA-050', 'LA-050 L-Angle', NULL, 'Pallet-51', 1, 'L-Angle', '50x50', 6000.00, 'mm', 10, 'PCS', 20.00, 200.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.147542', '2026-05-31 14:55:09.147542');
INSERT INTO public.inventory VALUES (387, 'RHS-088', 'RHS-088 Rectangular Hollow', NULL, 'Pallet-52', NULL, 'Rectangular Hollow', '100x50 ', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.476738', '2026-05-31 14:55:09.476738');
INSERT INTO public.inventory VALUES (389, 'RHS-089', 'RHS-089 Rectangular Hollow', NULL, 'Pallet-52', NULL, 'Rectangular Hollow', '100x25 ', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.559025', '2026-05-31 14:55:09.559025');
INSERT INTO public.inventory VALUES (390, 'RHS-090', 'RHS-090 Rectangular Hollow', NULL, 'Pallet-52', NULL, 'Rectangular Hollow', '100x38', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.565249', '2026-05-31 14:55:09.565249');
INSERT INTO public.inventory VALUES (393, 'LA-051', 'LA-051 L-Angle', NULL, 'Pallet-55', 1, 'L-Angle', '50x50 L Angle', 0.00, 'mm', 9, 'PCS', 20.00, 180.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.668394', '2026-05-31 14:55:09.668394');
INSERT INTO public.inventory VALUES (396, 'RHS-091', 'RHS-091 Rectangular Hollow', NULL, 'Pallet-55', NULL, 'Rectangular Hollow', '75x50x2.8mm Thk', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.76335', '2026-05-31 14:55:09.76335');
INSERT INTO public.inventory VALUES (397, 'RHS-092', 'RHS-092 Rectangular Hollow', NULL, 'Pallet-55', NULL, 'Rectangular Hollow', '50x25x2.8mm Thk', 0.00, 'mm', 2, 'PCS', 20.00, 40.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.76749', '2026-05-31 14:55:09.76749');
INSERT INTO public.inventory VALUES (401, 'RHS-093', 'RHS-093 Rectangular Hollow', NULL, 'Pallet-55', NULL, 'Rectangular Hollow', '50x38x2.8mm Thk', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:09.958563', '2026-05-31 14:55:09.958563');
INSERT INTO public.inventory VALUES (425, 'RHS-094', 'RHS-094 Rectangular Hollow', NULL, 'Pallet-57', NULL, 'Rectangular Hollow', '150x50', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:11.044258', '2026-05-31 14:55:11.044258');
INSERT INTO public.inventory VALUES (426, 'RHS-095', 'RHS-095 Rectangular Hollow', NULL, 'Pallet-57', NULL, 'Rectangular Hollow', '38x100 ', 0.00, 'mm', 1, 'PCS', 20.00, 20.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-05-31 14:55:11.049365', '2026-05-31 14:55:11.049365');
INSERT INTO public.inventory VALUES (1, 'LA-001', 'LA-001 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '25x75x2.8mm Thk', 6000.00, 'mm', 94, 'PCS', 100.00, 9400.00, 'SGD', 'OK', 10, 50, '', true, '2026-06-01 00:45:25.188405', '2026-06-01 00:45:25.188405');
INSERT INTO public.inventory VALUES (2, 'LA-002', 'LA-002 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '50x100x2.8mm Thk', 6000.00, 'mm', 6, 'PCS', 60.00, 360.00, 'SGD', 'LOW_STOCK', 10, 50, '', true, '2026-06-01 00:45:25.317002', '2026-06-01 00:45:25.317002');
INSERT INTO public.inventory VALUES (3, 'LA-003', 'LA-003 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '50x50x4mm Thk', 6000.00, 'mm', 36, 'PCS', 40.00, 1440.00, 'SGD', 'OK', 10, 50, '', true, '2026-06-01 00:45:25.320143', '2026-06-01 00:45:25.320143');
INSERT INTO public.inventory VALUES (4, 'LA-004', 'LA-004 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '50x100x4mm Thk', 6000.00, 'mm', 38, 'PCS', 20.00, 760.00, 'SGD', 'OK', 10, 50, '', true, '2026-06-01 00:45:25.32244', '2026-06-01 00:45:25.32244');
INSERT INTO public.inventory VALUES (5, 'LA-005', 'LA-005 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '50x75x4mm Thk', 6000.00, 'mm', 58, 'PCS', 20.00, 1160.00, 'SGD', 'OK', 10, 50, '1Pcs for 16 third ave* (30/1/2026)', true, '2026-06-01 00:45:25.324761', '2026-06-01 00:45:25.324761');
INSERT INTO public.inventory VALUES (6, 'LA-006', 'LA-006 L-Angle', 1, 'Pallet-01', 1, 'L-Angle', '75x75x4mm Thk', 6000.00, 'mm', 13, 'PCS', 20.00, 260.00, 'SGD', 'OK', 10, 50, '', true, '2026-06-01 00:45:25.327344', '2026-06-01 00:45:25.327344');


--
-- Data for Name: inventory_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.inventory_profiles VALUES (1, 'LA', 'L-Angle', 'Structural', NULL, 'PCS', 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.inventory_profiles VALUES (2, 'CH', 'Channel', 'Structural', NULL, 'PCS', 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.inventory_profiles VALUES (3, 'FL', 'Flat', 'Structural', NULL, 'PCS', 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.inventory_profiles VALUES (4, 'RD', 'Round', 'Structural', NULL, 'PCS', 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.inventory_profiles VALUES (5, 'FB', 'Flat Bar', NULL, NULL, 'PCS', 'Active', '2026-06-01 08:19:15.973736', '2026-06-01 08:19:15.973736');
INSERT INTO public.inventory_profiles VALUES (6, 'RH', 'Rectangular Hollow', NULL, NULL, 'PCS', 'Active', '2026-06-01 08:19:16.004804', '2026-06-01 08:19:16.004804');
INSERT INTO public.inventory_profiles VALUES (7, 'SH', 'Square Hollow', NULL, NULL, 'PCS', 'Active', '2026-06-01 08:19:16.01163', '2026-06-01 08:19:16.01163');
INSERT INTO public.inventory_profiles VALUES (8, 'RY', '30013', NULL, NULL, 'PCS', 'Active', '2026-06-01 08:19:16.280539', '2026-06-01 08:19:16.280539');


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.projects VALUES (1, '1402 Cedar Road', 'Closed', 100000.00, 100000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Apr''25": 0.11, "Mar''25": 0.59}', '{"Apr''25": 0.11, "Mar''25": 0.59}', '{"Apr''25": 11000, "Mar''25": 59000}', 'low', NULL, '2026-06-06 19:05:21.141857', '2026-06-06 19:05:21.141857', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 30000.00);
INSERT INTO public.projects VALUES (2, '400 Liberty Park', 'Completed', 700000.00, 630000.00, DEFAULT, 1.0000, 0.9000, 1.0000, 0.9000, '{"Apr''25": 0.25, "Mar''25": 0.25, "May''25": 0.25}', '{"Apr''25": 0.2, "Mar''25": 0.25, "May''25": 0.2}', '{"Apr''25": 140000, "Mar''25": 175000, "May''25": 140000}', 'low', NULL, '2026-06-06 19:05:21.254358', '2026-06-06 19:05:21.254358', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 175000.00);
INSERT INTO public.projects VALUES (3, '350 Evergreen', 'In Progress', 1000000.00, 800000.00, DEFAULT, 1.0000, 0.8000, 1.0000, 0.8000, '{"Apr''26": 0.15, "Jun''26": 0.2, "Mar''26": 0.25, "May''26": 0.2}', '{"Apr''26": 0.15, "Mar''26": 0.25, "May''26": 0.2}', '{"Apr''26": 150000, "Mar''26": 250000, "May''26": 200000}', 'medium', NULL, '2026-06-06 19:05:21.257755', '2026-06-06 19:05:21.257755', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 200000.00);
INSERT INTO public.projects VALUES (4, '2205 Jefferson Ave', 'In Progress', 340000.00, 306000.00, DEFAULT, 0.0000, 0.9000, 1.0000, 0.9000, '{"Apr''26": 0.3, "Feb''26": 0.05, "Mar''26": 0.25, "May''26": 0.1}', '{"Apr''26": 0.3, "Feb''26": 0.05, "Mar''26": 0.25}', '{"Apr''26": 102000, "Feb''26": 17000, "Mar''26": 85000}', 'low', NULL, '2026-06-06 19:05:21.259748', '2026-06-06 19:05:21.259748', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 102000.00);
INSERT INTO public.projects VALUES (5, '12 HARLYN ROAD', 'Upcoming Project', 735810.00, 0.00, DEFAULT, 0.3000, 0.0000, 1.0000, 0.2000, '{"Jun''26": 0.4, "May''26": 0.2, "July''26": 0.2}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.261933', '2026-06-06 19:05:21.261933', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (6, '11 Lynwood project', 'Upcoming Project', 0.00, 0.00, DEFAULT, 0.0000, 0.0000, 1.0000, 0.2500, '{"Apr''26": 0.05, "Jun''26": 0.3, "May''26": 0.25, "July''26": 0.15}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.263971', '2026-06-06 19:05:21.263971', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (7, '2450 Maple Ave', 'Closed', 120000.00, 120000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.459112, "Jan''25": 0.290888}', '{"Feb''25": 0.459112, "Jan''25": 0.290888}', '{"Feb''25": 55093.39, "Jan''25": 34906.61}', 'low', NULL, '2026-06-06 19:05:21.265849', '2026-06-06 19:05:21.265849', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 30000.00);
INSERT INTO public.projects VALUES (8, '1875 Oak St', 'Closed', 95000.00, 95000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.538291, "Jan''25": 0.211709}', '{"Feb''25": 0.538291, "Jan''25": 0.211709}', '{"Feb''25": 51137.61, "Jan''25": 20112.39}', 'low', NULL, '2026-06-06 19:05:21.267404', '2026-06-06 19:05:21.267404', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 23750.00);
INSERT INTO public.projects VALUES (9, '3320 Pine Dr', 'Closed', 180000.00, 180000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Apr''25": 0.246689, "Feb''25": 0.162681, "Jan''25": 0.302768, "Mar''25": 0.087862}', '{"Apr''25": 0.246689, "Feb''25": 0.162681, "Jan''25": 0.302768, "Mar''25": 0.087862}', '{"Apr''25": 44404.02, "Feb''25": 29282.66, "Jan''25": 54498.15, "Mar''25": 15815.17}', 'low', NULL, '2026-06-06 19:05:21.269334', '2026-06-06 19:05:21.269334', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 36000.00);
INSERT INTO public.projects VALUES (10, '4100 Elm Ct', 'Closed', 150000.00, 150000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Apr''25": 0.247581, "Feb''25": 0.177144, "Jan''25": 0.270762, "Mar''25": 0.104513}', '{"Apr''25": 0.247581, "Feb''25": 0.177144, "Jan''25": 0.270762, "Mar''25": 0.104513}', '{"Apr''25": 37137.14, "Feb''25": 26571.64, "Jan''25": 40614.26, "Mar''25": 15676.96}', 'low', NULL, '2026-06-06 19:05:21.271016', '2026-06-06 19:05:21.271016', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 30000.00);
INSERT INTO public.projects VALUES (11, '5678 Birch Ln', 'Closed', 135000.00, 135000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.522104, "Jan''25": 0.227896}', '{"Feb''25": 0.522104, "Jan''25": 0.227896}', '{"Feb''25": 70484, "Jan''25": 30766}', 'low', NULL, '2026-06-06 19:05:21.273216', '2026-06-06 19:05:21.273216', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 33750.00);
INSERT INTO public.projects VALUES (12, '7890 Cedar Park', 'Closed', 165000.00, 165000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.138839, "Jan''25": 0.196119, "Mar''25": 0.415042}', '{"Feb''25": 0.138839, "Jan''25": 0.196119, "Mar''25": 0.415042}', '{"Feb''25": 22908.51, "Jan''25": 32359.61, "Mar''25": 68481.88}', 'low', NULL, '2026-06-06 19:05:21.276094', '2026-06-06 19:05:21.276094', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 41250.00);
INSERT INTO public.projects VALUES (13, '2341 Willow Rd', 'Closed', 110000.00, 110000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.182673, "Jan''25": 0.317623, "Mar''25": 0.299705}', '{"Feb''25": 0.182673, "Jan''25": 0.317623, "Mar''25": 0.299705}', '{"Feb''25": 20094, "Jan''25": 34938.48, "Mar''25": 32967.52}', 'low', NULL, '2026-06-06 19:05:21.277813', '2026-06-06 19:05:21.277813', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 22000.00);
INSERT INTO public.projects VALUES (14, '6543 Spruce Way', 'Closed', 145000.00, 145000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.147103, "Jan''25": 0.228132, "Mar''25": 0.374766}', '{"Feb''25": 0.147103, "Jan''25": 0.228132, "Mar''25": 0.374766}', '{"Feb''25": 21329.9, "Jan''25": 33079.09, "Mar''25": 54341.01}', 'low', NULL, '2026-06-06 19:05:21.279253', '2026-06-06 19:05:21.279253', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 36250.00);
INSERT INTO public.projects VALUES (15, '8765 Aspen Blvd', 'Closed', 175000.00, 175000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.505115, "Jan''25": 0.194885}', '{"Feb''25": 0.505115, "Jan''25": 0.194885}', '{"Feb''25": 88395.18, "Jan''25": 34104.82}', 'low', NULL, '2026-06-06 19:05:21.280825', '2026-06-06 19:05:21.280825', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 52500.00);
INSERT INTO public.projects VALUES (16, '9012 Redwood Cir', 'Closed', 125000.00, 125000.00, DEFAULT, 1.0000, 1.0000, 1.0000, 1.0000, '{"Feb''25": 0.459688, "Jan''25": 0.240312}', '{"Feb''25": 0.459688, "Jan''25": 0.240312}', '{"Feb''25": 57461.02, "Jan''25": 30038.98}', 'low', NULL, '2026-06-06 19:05:21.28232', '2026-06-06 19:05:21.28232', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 37500.00);
INSERT INTO public.projects VALUES (17, '1234 Valley View', 'Completed', 250000.00, 235000.00, DEFAULT, 1.0000, 0.9400, 0.9958, 0.9400, '{"Apr''25": 0.14, "Feb''25": 0.175804, "Jan''25": 0.161203, "Mar''25": 0.087128, "May''25": 0.131643}', '{"Apr''25": 0.084221, "Feb''25": 0.175804, "Jan''25": 0.161203, "Mar''25": 0.087128, "May''25": 0.131643}', '{"Apr''25": 21055.36, "Feb''25": 43951.08, "Jan''25": 40300.67, "Mar''25": 21782.12, "May''25": 32910.77}', 'low', NULL, '2026-06-06 19:05:21.284318', '2026-06-06 19:05:21.284318', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 75000.00);
INSERT INTO public.projects VALUES (18, '5567 Mountain Ridge', 'Completed', 280000.00, 254800.00, DEFAULT, 1.0000, 0.9100, 0.9100, 0.9100, '{"Feb''25": 0.18679, "Jan''25": 0.204087, "Mar''25": 0.319122}', '{"Feb''25": 0.18679, "Jan''25": 0.204087, "Mar''25": 0.319122}', '{"Feb''25": 52301.27, "Jan''25": 57144.48, "Mar''25": 89354.25}', 'low', NULL, '2026-06-06 19:05:21.286328', '2026-06-06 19:05:21.286328', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 56000.00);
INSERT INTO public.projects VALUES (19, '8901 Lake Shore', 'Completed', 195000.00, 181350.00, DEFAULT, 1.0000, 0.9300, 0.9983, 0.9300, '{"Apr''25": 0.087115, "Feb''25": 0.152655, "Jan''25": 0.185182, "Mar''25": 0.2, "May''25": 0.173358}', '{"Apr''25": 0.087115, "Feb''25": 0.152655, "Jan''25": 0.185182, "Mar''25": 0.131691, "May''25": 0.173358}', '{"Apr''25": 16987.33, "Feb''25": 29767.74, "Jan''25": 36110.52, "Mar''25": 25679.65, "May''25": 33804.76}', 'low', NULL, '2026-06-06 19:05:21.288032', '2026-06-06 19:05:21.288032', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 39000.00);
INSERT INTO public.projects VALUES (38, '7891 Horizon Tower', 'Upcoming Project', 450000.00, 0.00, DEFAULT, 0.1800, 0.0000, 0.3000, 0.3000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.404057', '2026-06-06 19:05:21.404057', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (20, '3456 Harbor Point', 'Completed', 220000.00, 204600.00, DEFAULT, 1.0000, 0.9300, 1.0000, 0.9300, '{"Apr''25": 0.07, "Feb''25": 0.172126, "Jan''25": 0.232245, "Mar''25": 0.13, "May''25": 0.145793}', '{"Apr''25": 0.052094, "Feb''25": 0.172126, "Jan''25": 0.232245, "Mar''25": 0.077741, "May''25": 0.145793}', '{"Apr''25": 11460.77, "Feb''25": 37867.8, "Jan''25": 51093.9, "Mar''25": 17103.02, "May''25": 32074.51}', 'low', NULL, '2026-06-06 19:05:21.291331', '2026-06-06 19:05:21.291331', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 55000.00);
INSERT INTO public.projects VALUES (21, '7788 Riverside Plaza', 'Completed', 265000.00, 245277.36, DEFAULT, 1.0000, 0.9256, 0.9964, 0.9256, '{"Apr''25": 0.236353, "Feb''25": 0.16, "Jan''25": 0.22, "Mar''25": 0.13}', '{"Apr''25": 0.236353, "Feb''25": 0.123321, "Jan''25": 0.185901, "Mar''25": 0.13}', '{"Apr''25": 62633.62, "Feb''25": 32679.99, "Jan''25": 49263.75, "Mar''25": 34450}', 'low', NULL, '2026-06-06 19:05:21.295301', '2026-06-06 19:05:21.295301', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 66250.00);
INSERT INTO public.projects VALUES (22, '2233 Sunset Ave', 'Completed', 180000.00, 169200.00, DEFAULT, 1.0000, 0.9400, 1.0000, 0.9400, '{"Apr''25": 0.199632, "Feb''25": 0.170183, "Jan''25": 0.211577, "Mar''25": 0.17}', '{"Apr''25": 0.199632, "Feb''25": 0.170183, "Jan''25": 0.211577, "Mar''25": 0.108607}', '{"Apr''25": 35933.75, "Feb''25": 30633.01, "Jan''25": 38083.94, "Mar''25": 19549.3}', 'low', NULL, '2026-06-06 19:05:21.29657', '2026-06-06 19:05:21.29657', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 45000.00);
INSERT INTO public.projects VALUES (23, '4455 Ocean Dr', 'Completed', 240000.00, 206400.00, DEFAULT, 1.0000, 0.8600, 1.0000, 0.8600, '{"Apr''25": 0.13, "Feb''25": 0.163746, "Jan''25": 0.168988, "Mar''25": 0.17, "May''25": 0.119365}', '{"Apr''25": 0.048687, "Feb''25": 0.163746, "Jan''25": 0.168988, "Mar''25": 0.109215, "May''25": 0.119365}', '{"Apr''25": 11684.88, "Feb''25": 39298.94, "Jan''25": 40557.12, "Mar''25": 26211.51, "May''25": 28647.55}', 'medium', NULL, '2026-06-06 19:05:21.297887', '2026-06-06 19:05:21.297887', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 60000.00);
INSERT INTO public.projects VALUES (24, '6677 Bay St', 'Completed', 210000.00, 199500.00, DEFAULT, 1.0000, 0.9500, 1.0000, 0.9500, '{"Feb''25": 0.23, "Jan''25": 0.21, "Mar''25": 0.31}', '{"Feb''25": 0.206954, "Jan''25": 0.176784, "Mar''25": 0.316262}', '{"Feb''25": 43460.31, "Jan''25": 37124.73, "Mar''25": 66414.96}', 'low', NULL, '2026-06-06 19:05:21.299099', '2026-06-06 19:05:21.299099', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 52500.00);
INSERT INTO public.projects VALUES (25, '9900 Park Ln', 'Completed', 290000.00, 266800.00, DEFAULT, 1.0000, 0.9200, 1.0000, 0.9200, '{"Feb''25": 0.14, "Jan''25": 0.26, "Mar''25": 0.301646}', '{"Feb''25": 0.100922, "Jan''25": 0.217432, "Mar''25": 0.301646}', '{"Feb''25": 29267.43, "Jan''25": 63055.21, "Mar''25": 87477.36}', 'low', NULL, '2026-06-06 19:05:21.300335', '2026-06-06 19:05:21.300335', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 87000.00);
INSERT INTO public.projects VALUES (26, '1122 Garden Ct', 'Completed', 175000.00, 154000.00, DEFAULT, 1.0000, 0.8800, 1.0000, 0.8800, '{"Apr''25": 0.22, "Feb''25": 0.15, "Jan''25": 0.1637, "Mar''25": 0.17}', '{"Apr''25": 0.181561, "Feb''25": 0.113735, "Jan''25": 0.1637, "Mar''25": 0.121004}', '{"Apr''25": 31773.15, "Feb''25": 19903.57, "Jan''25": 28647.54, "Mar''25": 21175.74}', 'medium', NULL, '2026-06-06 19:05:21.301774', '2026-06-06 19:05:21.301774', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 52500.00);
INSERT INTO public.projects VALUES (27, '3344 Tech Center', 'In Progress', 350000.00, 120026.97, DEFAULT, 0.5200, 0.3429, 0.4800, 0.3429, '{"Apr''26": 0.085056, "Jun''26": 0.049644, "May''26": 0.057878, "July''26": 0.087422}', '{"Apr''26": 0.085056, "May''26": 0.057878}', '{"Apr''26": 29769.63, "May''26": 20257.34}', 'medium', NULL, '2026-06-06 19:05:21.303099', '2026-06-06 19:05:21.303099', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 70000.00);
INSERT INTO public.projects VALUES (28, '5566 Innovation Hub', 'In Progress', 420000.00, 216283.80, DEFAULT, 0.4900, 0.5150, 0.6675, 0.5150, '{"Apr''26": 0.078981, "Jun''26": 0.152539, "Mar''26": 0.109673, "May''26": 0.076307}', '{"Apr''26": 0.078981, "Mar''26": 0.109673, "May''26": 0.076307}', '{"Apr''26": 33172.04, "Mar''26": 46062.82, "May''26": 32048.94}', 'low', NULL, '2026-06-06 19:05:21.304478', '2026-06-06 19:05:21.304478', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 105000.00);
INSERT INTO public.projects VALUES (29, '7788 Commerce Plaza', 'In Progress', 380000.00, 158629.27, DEFAULT, 0.5000, 0.4174, 0.4600, 0.4174, '{"Apr''26": 0.100344, "Jun''26": 0.042555, "May''26": 0.05061, "June''25": 0.066492}', '{"Apr''26": 0.100344, "May''26": 0.05061, "June''25": 0.066492}', '{"Apr''26": 38130.62, "May''26": 19231.82, "June''25": 25266.83}', 'low', NULL, '2026-06-06 19:05:21.306904', '2026-06-06 19:05:21.306904', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 76000.00);
INSERT INTO public.projects VALUES (30, '9900 Business Park', 'In Progress', 460000.00, 280319.74, DEFAULT, 0.6800, 0.6094, 0.8870, 0.6094, '{"Apr''26": 0.167, "Jun''26": 0.277609, "May''26": 0.14239}', '{"Apr''26": 0.167, "May''26": 0.14239}', '{"Apr''26": 76820.21, "May''26": 65499.53}', 'low', NULL, '2026-06-06 19:05:21.315695', '2026-06-06 19:05:21.315695', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 138000.00);
INSERT INTO public.projects VALUES (31, '2211 Industrial Way', 'In Progress', 290000.00, 162914.41, DEFAULT, 0.7400, 0.5618, 0.6700, 0.5618, '{"Jun''26": 0.108226, "May''26": 0.093245, "June''25": 0.168529}', '{"May''26": 0.093245, "June''25": 0.168529}', '{"May''26": 27040.96, "June''25": 48873.45}', 'medium', NULL, '2026-06-06 19:05:21.387036', '2026-06-06 19:05:21.387036', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 87000.00);
INSERT INTO public.projects VALUES (32, '4433 Corporate Dr', 'In Progress', 335000.00, 191464.68, DEFAULT, 0.7300, 0.5715, 0.6200, 0.5715, '{"Apr''26": 0.126292, "Jun''26": 0.048464, "May''26": 0.069616, "June''25": 0.125628}', '{"Apr''26": 0.126292, "May''26": 0.069616, "June''25": 0.125628}', '{"Apr''26": 42307.89, "May''26": 23321.47, "June''25": 42085.32}', 'medium', NULL, '2026-06-06 19:05:21.38945', '2026-06-06 19:05:21.38945', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 83750.00);
INSERT INTO public.projects VALUES (33, '6655 Enterprise Rd', 'In Progress', 395000.00, 356145.11, DEFAULT, 0.7900, 0.9016, 1.0000, 0.9016, '{"Apr''26": 0.251633, "May''26": 0.45}', '{"Apr''26": 0.251633, "May''26": 0.35}', '{"Apr''26": 99395.11, "May''26": 138250}', 'low', NULL, '2026-06-06 19:05:21.393168', '2026-06-06 19:05:21.393168', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 118500.00);
INSERT INTO public.projects VALUES (34, '8877 Venture St', 'In Progress', 410000.00, 251859.66, DEFAULT, 0.5600, 0.6143, 0.8070, 0.6143, '{"Apr''26": 0.089401, "Jun''26": 0.192708, "Mar''26": 0.149635, "May''26": 0.075256}', '{"Apr''26": 0.089401, "Mar''26": 0.149635, "May''26": 0.075256}', '{"Apr''26": 36654.38, "Mar''26": 61350.26, "May''26": 30855.02}', 'low', NULL, '2026-06-06 19:05:21.395958', '2026-06-06 19:05:21.395958', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 123000.00);
INSERT INTO public.projects VALUES (35, '1010 Summit Pl', 'In Progress', 315000.00, 220500.00, DEFAULT, 0.8100, 0.7000, 0.7000, 0.7000, '{"Apr''26": 0.196329, "Feb''26": 0.132861, "Mar''26": 0.070811}', '{"Apr''26": 0.196329, "Feb''26": 0.132861, "Mar''26": 0.070811}', '{"Apr''26": 61843.5, "Feb''26": 41851.14, "Mar''26": 22305.36}', 'medium', NULL, '2026-06-06 19:05:21.398033', '2026-06-06 19:05:21.398033', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 94500.00);
INSERT INTO public.projects VALUES (36, '3030 Gateway Blvd', 'In Progress', 485000.00, 318670.63, DEFAULT, 0.7500, 0.6571, 0.9947, 0.6571, '{"Apr''26": 0.264249, "Jun''26": 0.280447, "May''26": 0.2}', '{"Apr''26": 0.264249, "May''26": 0.142804}', '{"Apr''26": 128160.71, "May''26": 69259.92}', 'low', NULL, '2026-06-06 19:05:21.39994', '2026-06-06 19:05:21.39994', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 121250.00);
INSERT INTO public.projects VALUES (37, '4567 Future Plaza', 'Upcoming Project', 520000.00, 0.00, DEFAULT, 0.2600, 0.0000, 0.2000, 0.2000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.402088', '2026-06-06 19:05:21.402088', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (39, '2345 Vision Center', 'Upcoming Project', 380000.00, 0.00, DEFAULT, 0.2700, 0.0000, 0.2000, 0.2000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.406144', '2026-06-06 19:05:21.406144', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (40, '6789 Dream Ave', 'Upcoming Project', 495000.00, 0.00, DEFAULT, 0.0300, 0.0000, 0.3000, 0.3000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.40974', '2026-06-06 19:05:21.40974', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (41, '1357 Nexus Point', 'Upcoming Project', 560000.00, 0.00, DEFAULT, 0.0200, 0.0000, 0.2000, 0.2000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.411632', '2026-06-06 19:05:21.411632', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (42, '2468 Skyline Dr', 'Upcoming Project', 425000.00, 0.00, DEFAULT, 0.1200, 0.0000, 0.3000, 0.3000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.413431', '2026-06-06 19:05:21.413431', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (43, '9753 Pioneer Way', 'Upcoming Project', 510000.00, 0.00, DEFAULT, 0.2700, 0.0000, 0.3000, 0.3000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.414994', '2026-06-06 19:05:21.414994', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (44, '8642 Frontier Rd', 'Upcoming Project', 475000.00, 0.00, DEFAULT, 0.2900, 0.0000, 0.2000, 0.2000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.416997', '2026-06-06 19:05:21.416997', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (45, '5319 Discovery Ln', 'Upcoming Project', 535000.00, 0.00, DEFAULT, 0.1400, 0.0000, 0.2000, 0.2000, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.418864', '2026-06-06 19:05:21.418864', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);
INSERT INTO public.projects VALUES (46, '7531 Evolution Park', 'Upcoming Project', 590000.00, 0.00, DEFAULT, 0.0700, 0.0000, 0.2500, 0.2500, '{}', '{}', '{}', 'none', NULL, '2026-06-06 19:05:21.420621', '2026-06-06 19:05:21.420621', 'admin', 'BondBuildSG_Project_Forecast_Template.xlsx', 0.00);


--
-- Data for Name: stock_alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: stock_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.stock_permissions VALUES (1, 'Drafter', true, false, false, false, false, false, false, true, '2026-06-03 15:54:28.583095', '2026-06-03 15:54:28.583095');
INSERT INTO public.stock_permissions VALUES (3, 'Purchaser', true, true, true, true, true, true, false, true, '2026-06-03 15:54:28.583095', '2026-06-03 15:54:28.583095');
INSERT INTO public.stock_permissions VALUES (4, 'Factory In-charge', true, false, false, true, true, false, false, true, '2026-06-03 15:54:28.583095', '2026-06-03 15:54:28.583095');
INSERT INTO public.stock_permissions VALUES (5, 'Supervisor', true, false, false, true, false, false, false, true, '2026-06-03 15:54:28.583095', '2026-06-03 15:54:28.583095');
INSERT INTO public.stock_permissions VALUES (6, 'QS', true, true, true, false, false, false, false, true, '2026-06-03 15:54:28.583095', '2026-06-03 15:54:28.583095');
INSERT INTO public.stock_permissions VALUES (7, 'Admin', true, true, true, true, true, true, true, true, '2026-06-03 15:54:28.583095', '2026-06-03 15:54:28.583095');
INSERT INTO public.stock_permissions VALUES (2, 'Manager', true, true, true, true, true, true, false, true, '2026-06-03 15:54:28.583095', '2026-06-03 16:19:36.866684');


--
-- Data for Name: storage_locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.storage_locations VALUES (1, 'Pallet-01', 'Pallet Location 01', 'Pallet', 500, 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.storage_locations VALUES (2, 'Pallet-02', 'Pallet Location 02', 'Pallet', 500, 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.storage_locations VALUES (3, 'Shelf-A', 'Shelf A', 'Shelf', 300, 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.storage_locations VALUES (4, 'Shelf-B', 'Shelf B', 'Shelf', 300, 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.storage_locations VALUES (5, 'Bin-01', 'Bin Location 01', 'Bin', 200, 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.storage_locations VALUES (6, 'Bin-02', 'Bin Location 02', 'Bin', 200, 'Active', '2026-05-31 07:45:58.073228', '2026-05-31 07:45:58.073228');
INSERT INTO public.storage_locations VALUES (7, 'Pallet-03', 'Pallet-03', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.196096', '2026-06-01 08:19:16.196096');
INSERT INTO public.storage_locations VALUES (8, 'Pallet-04', 'Pallet-04', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.238399', '2026-06-01 08:19:16.238399');
INSERT INTO public.storage_locations VALUES (9, 'Pallet-07', 'Pallet-07', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.251642', '2026-06-01 08:19:16.251642');
INSERT INTO public.storage_locations VALUES (10, 'Pallet-08', 'Pallet-08', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.497392', '2026-06-01 08:19:16.497392');
INSERT INTO public.storage_locations VALUES (11, 'Pallet-10', 'Pallet-10', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.507181', '2026-06-01 08:19:16.507181');
INSERT INTO public.storage_locations VALUES (12, 'Pallet-11', 'Pallet-11', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.512107', '2026-06-01 08:19:16.512107');
INSERT INTO public.storage_locations VALUES (13, 'Pallet-17', 'Pallet-17', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.59162', '2026-06-01 08:19:16.59162');
INSERT INTO public.storage_locations VALUES (14, 'Pallet-22', 'Pallet-22', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.598429', '2026-06-01 08:19:16.598429');
INSERT INTO public.storage_locations VALUES (15, 'Pallet-24', 'Pallet-24', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.609022', '2026-06-01 08:19:16.609022');
INSERT INTO public.storage_locations VALUES (16, 'Pallet-25', 'Pallet-25', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.625932', '2026-06-01 08:19:16.625932');
INSERT INTO public.storage_locations VALUES (17, 'Pallet-26', 'Pallet-26', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.629796', '2026-06-01 08:19:16.629796');
INSERT INTO public.storage_locations VALUES (18, 'Pallet-34', 'Pallet-34', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.631715', '2026-06-01 08:19:16.631715');
INSERT INTO public.storage_locations VALUES (19, 'Pallet-44', 'Pallet-44', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.639624', '2026-06-01 08:19:16.639624');
INSERT INTO public.storage_locations VALUES (20, 'Pallet-46', 'Pallet-46', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.654658', '2026-06-01 08:19:16.654658');
INSERT INTO public.storage_locations VALUES (21, 'Pallet-49', 'Pallet-49', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.667662', '2026-06-01 08:19:16.667662');
INSERT INTO public.storage_locations VALUES (22, 'Pallet-50', 'Pallet-50', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.680766', '2026-06-01 08:19:16.680766');
INSERT INTO public.storage_locations VALUES (23, 'Pallet-51', 'Pallet-51', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.682749', '2026-06-01 08:19:16.682749');
INSERT INTO public.storage_locations VALUES (24, 'Pallet-52', 'Pallet-52', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.700717', '2026-06-01 08:19:16.700717');
INSERT INTO public.storage_locations VALUES (25, 'Pallet-55', 'Pallet-55', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.707547', '2026-06-01 08:19:16.707547');
INSERT INTO public.storage_locations VALUES (26, 'Pallet-57', 'Pallet-57', 'Pallet', NULL, 'Active', '2026-06-01 08:19:16.714125', '2026-06-01 08:19:16.714125');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.users VALUES ('d3b83412-f43f-46b9-bc84-c29d5ff50fc9', 'John', 'John', '$2b$10$oLiJyCoME6hensbXdsrSf.DVZy5ZS6KQQnQSmOWZk48F.XgN02Gza', 'Admin', 'System Admin', 'Active', '2026-06-03 11:45:48.739644', '2026-06-03 11:45:48.739644');
INSERT INTO public.users VALUES ('608d15ea-4e58-4053-81df-430dc956b805', 'Peter Tan', 'peter', '$2b$10$klbqUh5A1gkNQPN49WFx/uHvDverIUXKFMXYUFd.qs9FjIVXW/4ly', 'Drafter', 'Drafter', 'Active', '2026-06-03 11:45:49.358521', '2026-06-03 11:45:49.358521');
INSERT INTO public.users VALUES ('bf16d3f5-52a9-4c57-8b7a-b22cf94282a7', 'Freddy Lim', 'freddy', '$2b$10$QYInWS4n3VyAw/Be8QWpN.SeTxu551wMEXsJc7MAWBTx/EMHbKELS', 'Purchaser', 'Purchaser', 'Active', '2026-06-03 11:45:49.437041', '2026-06-03 11:45:49.437041');
INSERT INTO public.users VALUES ('5da23b51-8587-41aa-9837-da21ced2462e', 'James Wong', 'james', '$2b$10$mcWAOUOVFCW.dHM5yMopSeXKb2B8WBUCha4quY8fHLAd35/p11Cjy', 'Manager', 'Project Manager', 'Active', '2026-06-03 11:45:49.516366', '2026-06-03 11:45:49.516366');
INSERT INTO public.users VALUES ('66286f03-d893-4de7-8582-eb252554fe54', 'Michael Lee', 'Michael', '$2b$10$eEQa1nNjqGmZ1oRDGu7GQuDHAxbL2pIqHx97qcBTu17HyWqS.CGmG', 'QS', 'Quantity Surveyor', 'Active', '2026-06-03 11:45:49.66517', '2026-06-03 11:45:49.66517');
INSERT INTO public.users VALUES ('4f14a8a0-1b44-468f-bc07-bd0e139c7d5e', 'David', 'David', '$2b$10$Jn7RoarI2HxDjCeI3yn8WOnfSUwBLJmoSkfJdiuBdrjJY/zh2M.tS', 'Supervisor', 'Site Supervisor', 'Active', '2026-06-03 11:45:49.759884', '2026-06-03 11:45:49.759884');
INSERT INTO public.users VALUES ('f102f2d3-aa46-43bc-9439-aa2196359f9a', 'San', 'San', '$2b$10$SZB36BsSa.m42ZPxXQNyX.x9.B5whGka5pBTWBEm2gZzuA5Q1206.', 'Factory In-charge', 'Factory In-charge', 'Active', '2026-06-03 11:45:49.83629', '2026-06-03 11:45:49.83629');


--
-- Name: inventory_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_id_seq', 1041, true);


--
-- Name: inventory_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_profiles_id_seq', 12, true);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.projects_id_seq', 47, true);


--
-- Name: stock_alerts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_alerts_id_seq', 1, false);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_movements_id_seq', 1, false);


--
-- Name: stock_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_permissions_id_seq', 7, true);


--
-- Name: storage_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.storage_locations_id_seq', 26, true);


--
-- Name: inventory inventory_item_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_item_code_key UNIQUE (item_code);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: inventory_profiles inventory_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_profiles
    ADD CONSTRAINT inventory_profiles_pkey PRIMARY KEY (id);


--
-- Name: inventory_profiles inventory_profiles_profile_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_profiles
    ADD CONSTRAINT inventory_profiles_profile_code_key UNIQUE (profile_code);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_project_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_project_name_key UNIQUE (project_name);


--
-- Name: stock_alerts stock_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_alerts
    ADD CONSTRAINT stock_alerts_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_permissions stock_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_permissions
    ADD CONSTRAINT stock_permissions_pkey PRIMARY KEY (id);


--
-- Name: stock_permissions stock_permissions_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_permissions
    ADD CONSTRAINT stock_permissions_role_key UNIQUE (role);


--
-- Name: storage_locations storage_locations_location_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_location_code_key UNIQUE (location_code);


--
-- Name: storage_locations storage_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_alerts_inventory; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_inventory ON public.stock_alerts USING btree (inventory_id);


--
-- Name: idx_alerts_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_status ON public.stock_alerts USING btree (alert_status);


--
-- Name: idx_alerts_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_type ON public.stock_alerts USING btree (alert_type);


--
-- Name: idx_inventory_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_code ON public.inventory USING btree (item_code);


--
-- Name: idx_inventory_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_location ON public.inventory USING btree (location_id);


--
-- Name: idx_inventory_profile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_profile ON public.inventory USING btree (profile_id);


--
-- Name: idx_inventory_qty; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_qty ON public.inventory USING btree (quantity_in_stock);


--
-- Name: idx_inventory_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_status ON public.inventory USING btree (stock_status);


--
-- Name: idx_locations_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_locations_code ON public.storage_locations USING btree (location_code);


--
-- Name: idx_movements_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movements_date ON public.stock_movements USING btree (movement_date);


--
-- Name: idx_movements_inventory; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movements_inventory ON public.stock_movements USING btree (inventory_id);


--
-- Name: idx_movements_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movements_type ON public.stock_movements USING btree (movement_type);


--
-- Name: idx_profiles_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_code ON public.inventory_profiles USING btree (profile_code);


--
-- Name: idx_profiles_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_name ON public.inventory_profiles USING btree (profile_name);


--
-- Name: idx_projects_contract_sum; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_contract_sum ON public.projects USING btree (contract_sum);


--
-- Name: idx_projects_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at);


--
-- Name: idx_projects_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_name ON public.projects USING btree (project_name);


--
-- Name: idx_projects_risk_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_risk_level ON public.projects USING btree (risk_level);


--
-- Name: idx_projects_site_progress; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_site_progress ON public.projects USING btree (site_progress);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_projects_total_received; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_total_received ON public.projects USING btree (total_received);


--
-- Name: projects projects_update_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER projects_update_timestamp BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_projects_timestamp();


--
-- Name: inventory trg_log_stock_movement; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_stock_movement AFTER UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.log_stock_movement();


--
-- Name: inventory trg_update_stock_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_update_stock_status BEFORE INSERT OR UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_inventory_stock_status();


--
-- Name: inventory trg_update_total_value; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_update_total_value BEFORE INSERT OR UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_inventory_total_value();


--
-- Name: inventory inventory_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id);


--
-- Name: inventory inventory_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.inventory_profiles(id);


--
-- Name: stock_alerts stock_alerts_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_alerts
    ADD CONSTRAINT stock_alerts_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--
