create table "public"."actor_contacts" (
    "actor_id" integer not null,
    "contact_id" integer not null
);


create table "public"."actor_products" (
    "actor_id" integer not null,
    "product_id" integer not null
);


CREATE UNIQUE INDEX actor_contacts_pkey ON public.actor_contacts USING btree (actor_id, contact_id);

CREATE UNIQUE INDEX actor_products_pkey ON public.actor_products USING btree (actor_id, product_id);

alter table "public"."actor_contacts" add constraint "actor_contacts_pkey" PRIMARY KEY using index "actor_contacts_pkey";

alter table "public"."actor_products" add constraint "actor_products_pkey" PRIMARY KEY using index "actor_products_pkey";

alter table "public"."actor_contacts" add constraint "actor_contacts_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES actors(id) not valid;

alter table "public"."actor_contacts" validate constraint "actor_contacts_actor_id_fkey";

alter table "public"."actor_contacts" add constraint "actor_contacts_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES contacts(id) not valid;

alter table "public"."actor_contacts" validate constraint "actor_contacts_contact_id_fkey";

alter table "public"."actor_products" add constraint "actor_products_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES actors(id) not valid;

alter table "public"."actor_products" validate constraint "actor_products_actor_id_fkey";

alter table "public"."actor_products" add constraint "actor_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) not valid;

alter table "public"."actor_products" validate constraint "actor_products_product_id_fkey";

grant delete on table "public"."actor_contacts" to "anon";

grant insert on table "public"."actor_contacts" to "anon";

grant references on table "public"."actor_contacts" to "anon";

grant select on table "public"."actor_contacts" to "anon";

grant trigger on table "public"."actor_contacts" to "anon";

grant truncate on table "public"."actor_contacts" to "anon";

grant update on table "public"."actor_contacts" to "anon";

grant delete on table "public"."actor_contacts" to "authenticated";

grant insert on table "public"."actor_contacts" to "authenticated";

grant references on table "public"."actor_contacts" to "authenticated";

grant select on table "public"."actor_contacts" to "authenticated";

grant trigger on table "public"."actor_contacts" to "authenticated";

grant truncate on table "public"."actor_contacts" to "authenticated";

grant update on table "public"."actor_contacts" to "authenticated";

grant delete on table "public"."actor_contacts" to "service_role";

grant insert on table "public"."actor_contacts" to "service_role";

grant references on table "public"."actor_contacts" to "service_role";

grant select on table "public"."actor_contacts" to "service_role";

grant trigger on table "public"."actor_contacts" to "service_role";

grant truncate on table "public"."actor_contacts" to "service_role";

grant update on table "public"."actor_contacts" to "service_role";

grant delete on table "public"."actor_products" to "anon";

grant insert on table "public"."actor_products" to "anon";

grant references on table "public"."actor_products" to "anon";

grant select on table "public"."actor_products" to "anon";

grant trigger on table "public"."actor_products" to "anon";

grant truncate on table "public"."actor_products" to "anon";

grant update on table "public"."actor_products" to "anon";

grant delete on table "public"."actor_products" to "authenticated";

grant insert on table "public"."actor_products" to "authenticated";

grant references on table "public"."actor_products" to "authenticated";

grant select on table "public"."actor_products" to "authenticated";

grant trigger on table "public"."actor_products" to "authenticated";

grant truncate on table "public"."actor_products" to "authenticated";

grant update on table "public"."actor_products" to "authenticated";

grant delete on table "public"."actor_products" to "service_role";

grant insert on table "public"."actor_products" to "service_role";

grant references on table "public"."actor_products" to "service_role";

grant select on table "public"."actor_products" to "service_role";

grant trigger on table "public"."actor_products" to "service_role";

grant truncate on table "public"."actor_products" to "service_role";

grant update on table "public"."actor_products" to "service_role";


