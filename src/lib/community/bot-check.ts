import { checkBotId } from "botid/server"

export async function rejectBot(): Promise<Response | null> {
  const verification = await checkBotId()

  if (!verification.isBot) {
    return null
  }

  return Response.json({ error: "Automated request refused." }, { status: 403 })
}
