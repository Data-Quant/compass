-- Employees can also ask to change their lead or a team member; HR decides those, so they have no voting links.
CREATE TYPE "MappingRelation" AS ENUM ('PEER', 'LEAD', 'REPORT');
ALTER TABLE "PeerChangeRequest" ADD COLUMN "relation" "MappingRelation" NOT NULL DEFAULT 'PEER';
ALTER TABLE "PeerChangeRequest" ALTER COLUMN "peerTokenHash" DROP NOT NULL;
