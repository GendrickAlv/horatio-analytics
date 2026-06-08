CREATE TABLE "appointments" (
	"appointment_id" bigint PRIMARY KEY NOT NULL,
	"patient_id" bigint NOT NULL,
	"neighbourhood_id" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"appointment_at" timestamp with time zone NOT NULL,
	"sms_received" boolean NOT NULL,
	"no_show" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighbourhoods" (
	"neighbourhood_id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "neighbourhoods_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"patient_id" bigint PRIMARY KEY NOT NULL,
	"gender" char(1) NOT NULL,
	"year_of_birth" smallint NOT NULL,
	"scholarship" boolean NOT NULL,
	"hypertension" boolean NOT NULL,
	"diabetes" boolean NOT NULL,
	"alcoholism" boolean NOT NULL,
	"handcap" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_neighbourhood_id_neighbourhoods_neighbourhood_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("neighbourhood_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_appointment_at_idx" ON "appointments" USING btree ("appointment_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_id_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointments_neighbourhood_id_idx" ON "appointments" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE INDEX "appointments_analytics_idx" ON "appointments" USING btree ("appointment_at","no_show","neighbourhood_id");