extension [E, A](e: Either[E, A])
  def map[B](f: A => B): Either[E, B] = e match
    case Right(a) => Right(f(a))
    case Left(err) => Left(err)
  def flatMap[EE >: E, B](f: A => Either[EE, B]): Either[EE, B] = e match
    case Right(a) => f(a)
    case Left(err) => Left(err)
  def orElse[EE >: E, B >: A](b: => Either[EE, B]): Either[EE, B] = e match
    case Right(_) => e
    case Left(_) => b
  def map2[EE >: E, B, C](b: Either[EE, B])(f: (A, B) => C): Either[EE, C] =
    e.flatMap(x => b.map(y => f(x, y)))
