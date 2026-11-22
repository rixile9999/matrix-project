def get[S]: State[S, S] =
  State(s => (s, s))

def set[S](s: S): State[S, Unit] =
  State(_ => ((), s))

def modify[S](f: S => S): State[S, Unit] =
  for
    s <- get
    _ <- set(f(s))
  yield ()
