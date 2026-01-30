create sequence "public"."actor_categories_id_seq";

create sequence "public"."product_categories_id_seq";

create sequence "public"."units_id_seq";

create table "public"."actor_categories" (
    "id" integer not null default nextval('actor_categories_id_seq'::regclass),
    "name" character varying(50) not null,
    "description" text
);


create table "public"."product_categories" (
    "id" integer not null default nextval('product_categories_id_seq'::regclass),
    "name" character varying(50) not null,
    "description" text
);


create table "public"."units" (
    "id" integer not null default nextval('units_id_seq'::regclass),
    "unit_code" character varying(10) not null,
    "description" character varying(50)
);


alter sequence "public"."actor_categories_id_seq" owned by "public"."actor_categories"."id";

alter sequence "public"."product_categories_id_seq" owned by "public"."product_categories"."id";

alter sequence "public"."units_id_seq" owned by "public"."units"."id";

CREATE UNIQUE INDEX actor_categories_name_key ON public.actor_categories USING btree (name);

CREATE UNIQUE INDEX actor_categories_pkey ON public.actor_categories USING btree (id);

CREATE UNIQUE INDEX product_categories_name_key ON public.product_categories USING btree (name);

CREATE UNIQUE INDEX product_categories_pkey ON public.product_categories USING btree (id);

CREATE UNIQUE INDEX units_pkey ON public.units USING btree (id);

CREATE UNIQUE INDEX units_unit_code_key ON public.units USING btree (unit_code);

alter table "public"."actor_categories" add constraint "actor_categories_pkey" PRIMARY KEY using index "actor_categories_pkey";

alter table "public"."product_categories" add constraint "product_categories_pkey" PRIMARY KEY using index "product_categories_pkey";

alter table "public"."units" add constraint "units_pkey" PRIMARY KEY using index "units_pkey";

alter table "public"."actor_categories" add constraint "actor_categories_name_key" UNIQUE using index "actor_categories_name_key";

alter table "public"."product_categories" add constraint "product_categories_name_key" UNIQUE using index "product_categories_name_key";

alter table "public"."units" add constraint "units_unit_code_key" UNIQUE using index "units_unit_code_key";

grant delete on table "public"."actor_categories" to "anon";

grant insert on table "public"."actor_categories" to "anon";

grant references on table "public"."actor_categories" to "anon";

grant select on table "public"."actor_categories" to "anon";

grant trigger on table "public"."actor_categories" to "anon";

grant truncate on table "public"."actor_categories" to "anon";

grant update on table "public"."actor_categories" to "anon";

grant delete on table "public"."actor_categories" to "authenticated";

grant insert on table "public"."actor_categories" to "authenticated";

grant references on table "public"."actor_categories" to "authenticated";

grant select on table "public"."actor_categories" to "authenticated";

grant trigger on table "public"."actor_categories" to "authenticated";

grant truncate on table "public"."actor_categories" to "authenticated";

grant update on table "public"."actor_categories" to "authenticated";

grant delete on table "public"."actor_categories" to "service_role";

grant insert on table "public"."actor_categories" to "service_role";

grant references on table "public"."actor_categories" to "service_role";

grant select on table "public"."actor_categories" to "service_role";

grant trigger on table "public"."actor_categories" to "service_role";

grant truncate on table "public"."actor_categories" to "service_role";

grant update on table "public"."actor_categories" to "service_role";

grant delete on table "public"."product_categories" to "anon";

grant insert on table "public"."product_categories" to "anon";

grant references on table "public"."product_categories" to "anon";

grant select on table "public"."product_categories" to "anon";

grant trigger on table "public"."product_categories" to "anon";

grant truncate on table "public"."product_categories" to "anon";

grant update on table "public"."product_categories" to "anon";

grant delete on table "public"."product_categories" to "authenticated";

grant insert on table "public"."product_categories" to "authenticated";

grant references on table "public"."product_categories" to "authenticated";

grant select on table "public"."product_categories" to "authenticated";

grant trigger on table "public"."product_categories" to "authenticated";

grant truncate on table "public"."product_categories" to "authenticated";

grant update on table "public"."product_categories" to "authenticated";

grant delete on table "public"."product_categories" to "service_role";

grant insert on table "public"."product_categories" to "service_role";

grant references on table "public"."product_categories" to "service_role";

grant select on table "public"."product_categories" to "service_role";

grant trigger on table "public"."product_categories" to "service_role";

grant truncate on table "public"."product_categories" to "service_role";

grant update on table "public"."product_categories" to "service_role";

grant delete on table "public"."units" to "anon";

grant insert on table "public"."units" to "anon";

grant references on table "public"."units" to "anon";

grant select on table "public"."units" to "anon";

grant trigger on table "public"."units" to "anon";

grant truncate on table "public"."units" to "anon";

grant update on table "public"."units" to "anon";

grant delete on table "public"."units" to "authenticated";

grant insert on table "public"."units" to "authenticated";

grant references on table "public"."units" to "authenticated";

grant select on table "public"."units" to "authenticated";

grant trigger on table "public"."units" to "authenticated";

grant truncate on table "public"."units" to "authenticated";

grant update on table "public"."units" to "authenticated";

grant delete on table "public"."units" to "service_role";

grant insert on table "public"."units" to "service_role";

grant references on table "public"."units" to "service_role";

grant select on table "public"."units" to "service_role";

grant trigger on table "public"."units" to "service_role";

grant truncate on table "public"."units" to "service_role";

grant update on table "public"."units" to "service_role";


