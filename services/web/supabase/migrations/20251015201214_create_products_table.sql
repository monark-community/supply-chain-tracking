create sequence "public"."products_id_seq";

create table "public"."products" (
    "id" integer not null default nextval('products_id_seq'::regclass),
    "name" character varying(100) not null,
    "description" text,
    "category_id" integer,
    "variety" character varying(50),
    "bag_type" character varying(50),
    "quantity" numeric(10,2),
    "unit" character varying(10),
    "shelf_life_hours" interval,
    "notes" text
);


alter sequence "public"."products_id_seq" owned by "public"."products"."id";

CREATE UNIQUE INDEX products_name_key ON public.products USING btree (name);

CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id);

alter table "public"."products" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."products" add constraint "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES product_categories(id) not valid;

alter table "public"."products" validate constraint "products_category_id_fkey";

alter table "public"."products" add constraint "products_name_key" UNIQUE using index "products_name_key";

alter table "public"."products" add constraint "products_unit_fkey" FOREIGN KEY (unit) REFERENCES units(unit_code) not valid;

alter table "public"."products" validate constraint "products_unit_fkey";

grant delete on table "public"."products" to "anon";

grant insert on table "public"."products" to "anon";

grant references on table "public"."products" to "anon";

grant select on table "public"."products" to "anon";

grant trigger on table "public"."products" to "anon";

grant truncate on table "public"."products" to "anon";

grant update on table "public"."products" to "anon";

grant delete on table "public"."products" to "authenticated";

grant insert on table "public"."products" to "authenticated";

grant references on table "public"."products" to "authenticated";

grant select on table "public"."products" to "authenticated";

grant trigger on table "public"."products" to "authenticated";

grant truncate on table "public"."products" to "authenticated";

grant update on table "public"."products" to "authenticated";

grant delete on table "public"."products" to "service_role";

grant insert on table "public"."products" to "service_role";

grant references on table "public"."products" to "service_role";

grant select on table "public"."products" to "service_role";

grant trigger on table "public"."products" to "service_role";

grant truncate on table "public"."products" to "service_role";

grant update on table "public"."products" to "service_role";


