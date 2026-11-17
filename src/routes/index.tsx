import { createFileRoute } from "@tanstack/react-router";
import { EduApp } from "@/edunexus/app";

export const Route = createFileRoute("/")({ component: EduApp });
