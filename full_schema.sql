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


ALTER FUNCTION public.log_stock_movement() OWNER TO doadmin;

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


ALTER FUNCTION public.update_inventory_stock_status() OWNER TO doadmin;

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


ALTER FUNCTION public.update_inventory_total_value() OWNER TO doadmin;

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


ALTER FUNCTION public.update_projects_timestamp() OWNER TO doadmin;

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


ALTER TABLE public.inventory OWNER TO doadmin;

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


ALTER SEQUENCE public.inventory_id_seq OWNER TO doadmin;

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


ALTER TABLE public.inventory_profiles OWNER TO doadmin;

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


ALTER SEQUENCE public.inventory_profiles_id_seq OWNER TO doadmin;

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


ALTER VIEW public.inventory_summary OWNER TO doadmin;

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


ALTER VIEW public.low_stock_items OWNER TO doadmin;

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


ALTER VIEW public.out_of_stock_items OWNER TO doadmin;

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


ALTER TABLE public.projects OWNER TO doadmin;

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


ALTER SEQUENCE public.projects_id_seq OWNER TO doadmin;

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


ALTER TABLE public.stock_alerts OWNER TO doadmin;

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


ALTER SEQUENCE public.stock_alerts_id_seq OWNER TO doadmin;

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


ALTER TABLE public.stock_movements OWNER TO doadmin;

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


ALTER SEQUENCE public.stock_movements_id_seq OWNER TO doadmin;

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


ALTER TABLE public.stock_permissions OWNER TO doadmin;

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


ALTER SEQUENCE public.stock_permissions_id_seq OWNER TO doadmin;

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


ALTER TABLE public.storage_locations OWNER TO doadmin;

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


ALTER SEQUENCE public.storage_locations_id_seq OWNER TO doadmin;

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


ALTER TABLE public.users OWNER TO doadmin;

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


