case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  Judge.check("정확히 절반")(double(scriptRng(1073741824)), (0.5, ScriptRNG(Vector(1073741824), 1)))
  Judge.check("0 은 0.0")(double(scriptRng(0))._1, 0.0)
  Judge.check("Int.MaxValue 도 1 미만")(double(scriptRng(Int.MaxValue))._1 < 1.0, true)
  Judge.check("Int.MinValue 도 1 미만")(double(scriptRng(Int.MinValue))._1 < 1.0, true)
  Judge.check("SimpleRNG 에서 항상 [0, 1)")(seeds.forall(r => { val d = double(r)._1; d >= 0.0 && d < 1.0 }), true)
  Judge.check("돌려주는 RNG 는 한 번 전진한 RNG")(double(SimpleRNG(7))._2, SimpleRNG(7).nextInt._2)
