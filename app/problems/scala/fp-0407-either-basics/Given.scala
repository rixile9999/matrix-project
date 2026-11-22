enum Either[+E, +A]:
  case Left(value: E)
  case Right(value: A)

export Either.{Left, Right}
