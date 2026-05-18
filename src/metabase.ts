import { env } from "./env.js";

interface MetabaseDatasetResponse {
  data: {
    cols: { name: string }[];
    rows: unknown[][];
  };
  status?: string;
  error?: string;
}

async function callMetabase(path: string, body: unknown): Promise<MetabaseDatasetResponse> {
  const res = await fetch(`${env.METABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.METABASE_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Metabase ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as MetabaseDatasetResponse;
}

function rowsToObjects(resp: MetabaseDatasetResponse): Record<string, unknown>[] {
  const names = resp.data.cols.map((c) => c.name);
  return resp.data.rows.map((row) =>
    Object.fromEntries(names.map((n, i) => [n, row[i]])),
  );
}

/**
 * Card 348 — Round 1 God Table. Uses built-in date params.
 */
export async function fetchRound1Candidates(
  dateISO: string, // YYYY-MM-DD, IST day
): Promise<Record<string, unknown>[]> {
  const resp = await callMetabase(`/api/card/${env.METABASE_CARD_ROUND1}/query`, {
    parameters: [
      { id: "created_at_start", type: "date/single", value: dateISO, target: ["variable", ["template-tag", "created_at_start"]] },
      { id: "created_at_end", type: "date/single", value: dateISO, target: ["variable", ["template-tag", "created_at_end"]] },
    ],
  });
  return rowsToObjects(resp);
}

/**
 * tal.users — pull rows onboarded on the given IST date, enriched with
 * LinkedIn profile / current experience / latest institute when available.
 * Falls back to user-typed metadata when the LinkedIn scrape hasn't run yet.
 */
export async function fetchTalUsers(
  dateISO: string,
): Promise<Record<string, unknown>[]> {
  const sql = `
    select
      u.id,
      u.phone,
      u.name,
      u.email,
      u.linkedin_url,
      u.location                              as user_location,
      u.grapevine_id::text                    as grapevine_id,
      u.metadata->>'currentCompany'           as meta_company,
      u.metadata->>'currentRole'              as meta_role,
      u.metadata->>'onboardedAt'              as onboarded_at_raw,
      (u.metadata->>'onboardedAt')::timestamptz at time zone '${env.INGEST_TZ}' as onboarded_at_ist,
      p.headline                              as li_headline,
      p.location_city                         as li_location_city,
      p.location_country                      as li_location_country,
      p.public_url                            as li_public_url,
      p.about                                 as li_about,
      ce.title                                as exp_title,
      cc.name                                 as exp_company,
      cc.url                                  as exp_company_url,
      ce.location                             as exp_location,
      ce.start_date                           as exp_start_date,
      ce.duration_text                        as exp_duration,
      ins.institute->>'name'                  as institute_name,
      ins.degree                              as institute_degree,
      ins.field_of_study                      as institute_field,
      ins.start_year                          as institute_start_year,
      ins.end_year                            as institute_end_year
    from tal.users u
    left join tal.user_profile p on p.user_id = u.grapevine_id
    left join lateral (
      select e.*
      from tal.user_experience e
      where e."user_Id" = u.grapevine_id and e.is_current = true
      order by e.ordinal asc
      limit 1
    ) ce on true
    left join tal.company cc on cc.id = ce.company_id
    left join lateral (
      select i.*
      from tal.user_institutes i
      where i.user_id = u.grapevine_id
      order by i.ordinal asc
      limit 1
    ) ins on true
    where u.onboarding_completed = true
      and ((u.metadata->>'onboardedAt')::timestamptz at time zone '${env.INGEST_TZ}')::date = '${dateISO}'::date
  `;
  const resp = await callMetabase(`/api/dataset`, {
    database: env.METABASE_DB_TAL,
    type: "native",
    native: { query: sql },
  });
  return rowsToObjects(resp);
}
