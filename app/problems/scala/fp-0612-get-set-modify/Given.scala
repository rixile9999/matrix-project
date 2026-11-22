case class State[S, +A](run: S => (A, S))

def unit[S, A](a: A): State[S, A] =
  State(s => (a, s))

extension [S, A](s: State[S, A])
  def flatMap[B](f: A => State[S, B]): State[S, B] =
    State(st =>
      val (a, st2) = s.run(st)
      f(a).run(st2))
  def map[B](f: A => B): State[S, B] =
    s.flatMap(a => unit(f(a)))
