import "server-only";

import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";

import type { Loaded } from "../lease/data";

export type Announcement = Schemas["ResidentAnnouncementDto"];
export type Parcel = Schemas["ResidentParcelDto"];
export type Facility = Schemas["FacilityDto"];
export type Booking = Schemas["BookingDto"];
export type Availability = Schemas["AvailabilityDto"];
export type BuildingRules = Schemas["ResidentRulesDto"];
export type Contact = Schemas["ContactDto"];

/** `GET /v1/resident/announcements` — published, not expired, for my units; pinned first; in my language if translated. */
export async function loadAnnouncements(): Promise<Loaded<Announcement[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/announcements");
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/parcels` — newest first, with the pick-up PIN while a parcel waits at the desk (D-212). */
export async function loadParcels(): Promise<Loaded<Parcel[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/parcels");
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/facilities?unitId=` — open facilities of the unit's building with their booking policy. */
export async function loadFacilities(unitId: string): Promise<Loaded<Facility[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/facilities", { params: { query: { unitId } } });
  return data ? { data: data.data.filter((f) => f.isActive) } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/facilities/{id}/availability?date=` — busy times of a Bangkok day (other units unnamed). */
export async function loadAvailability(facilityId: string, date: string): Promise<Loaded<Availability>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/facilities/{facilityId}/availability", {
    params: { path: { facilityId }, query: { date } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/facility-bookings` — the bookings of my units, newest first. */
export async function loadBookings(): Promise<Loaded<Booking[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/facility-bookings");
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/building-rules?unitId=` — the version in force and whether I acknowledged it. */
export async function loadRules(unitId: string): Promise<Loaded<BuildingRules>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/building-rules", { params: { query: { unitId } } });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/contacts?unitId=` — emergency, building, vendor and utility contacts. */
export async function loadContacts(unitId: string): Promise<Loaded<Contact[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/contacts", { params: { query: { unitId } } });
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}
