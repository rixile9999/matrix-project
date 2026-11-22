enum Option[+A]:
  case Some(get: A)
  case None

export Option.{Some, None}
