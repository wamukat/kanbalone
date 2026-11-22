import type { FastifyInstance } from "fastify";

import { type AttachmentStore } from "../attachments.js";
import { imageByteLimit, imageMediaTypes } from "../image-format.js";

export function registerAttachmentRoutes(app: FastifyInstance, store: AttachmentStore): void {
  app.register(async (routes) => {
    routes.addContentTypeParser([...imageMediaTypes], { parseAs: "buffer" }, (_request, bytes, done) => done(null, bytes));
    routes.post("/api/attachments", { bodyLimit: imageByteLimit }, async (request, reply) => {
      const mediaType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
      const supported = imageMediaTypes.find(type => type === mediaType);
      if (!supported) return reply.code(415).send({ error: "Unsupported image media type" });
      if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: "Image bytes required" });
      const image = store.withWrites(put => put(supported, request.body as Buffer));
      const url = "/api/attachments/" + image.id;
      return reply.code(201).header("Location", url).send({ ...image, url });
    });
    routes.get<{ Params: { id: string } }>("/api/attachments/:id", async (request, reply) => {
      const image = store.metadata(request.params.id);
      if (!image) return reply.code(404).send({ error: "Attachment not found" });
      const stream = await store.stream(image);
      return reply.type(image.mediaType).header("Content-Length", image.byteSize)
        .header("X-Content-Type-Options", "nosniff").header("Cache-Control", "private, max-age=31536000, immutable").send(stream);
    });
  });
}
