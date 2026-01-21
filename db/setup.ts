import postgres from "postgres";

const DATABASE_URL =process.env.DATABASE_URL!
console.log(DATABASE_URL);
export function getDatabase() {
  return postgres(DATABASE_URL, {
    max: 10,
  });
}
