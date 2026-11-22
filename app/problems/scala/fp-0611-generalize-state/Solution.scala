def unit[S, A](a: A): State[S, A] =
  State(s => (a, s))

extension [S, A](s: State[S, A])
  def flatMap[B](f: A => State[S, B]): State[S, B] =
    State(st =>
      val (a, st2) = s.run(st)
      f(a).run(st2))
  def map[B](f: A => B): State[S, B] =
    s.flatMap(a => unit(f(a)))
  def map2[B, C](sb: State[S, B])(f: (A, B) => C): State[S, C] =
    s.flatMap(a => sb.map(b => f(a, b)))

def sequence[S, A](fs: List[State[S, A]]): State[S, List[A]] =
  fs.foldRight(unit[S, List[A]](Nil))((f, acc) => f.map2(acc)(_ :: _))
